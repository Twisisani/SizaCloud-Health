import os
import json
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

app = Flask(__name__)
CORS(app)

REGION = os.environ.get("AWS_DEFAULT_REGION", "af-south-1")
S3_AUDIT_BUCKET = os.environ.get("S3_AUDIT_BUCKET", "sizacloud-doh-audit-logs-af-south-1")

# Multilingual SMS Templates for Amazon SNS
SMS_TEMPLATES = {
    'en': {
        'confirmed': "SizaCloud Health: Ticket {ticket} confirmed for {dept} ({priority}). Ahead: {waiting}. Est wait: {wait}m.",
        'called': "SizaCloud PA Alert: Ticket {ticket} ({name}), please proceed to {dept} counter NOW.",
        'transferred': "SizaCloud Transfer: Ticket {ticket} reassigned to {dept} ({priority}). Proceed when called."
    },
    'ts': {
        'confirmed': "SizaCloud Health: Thekete {ticket} ri tiyisisiwile eka {dept} ({priority}). Lava nga mahlweni ka wena: {waiting}. Nkarhi wo rindza lowu tshembiwaka: timinete ta {wait}.",
        'called': "Xitsundzuxo xa SizaCloud PA: Thekete {ticket} ({name}), ndzomboo, yana eka khawuntara ya {dept} SWESWI.",
        'transferred': "Ku hundzisiwa ka SizaCloud: Thekete {ticket} ri lulamisiwile nakambe eka {dept} ({priority}). Yana emahlweni loko u vitaniwa."

    },
    'zu': {
        'confirmed': "SizaCloud Impilo: Ithikithi {ticket} iqinisekisiwe ku-{dept} ({priority}). Phambi kwakho: {waiting}. Isikhathi sokulinda: {wait}m.",
        'called': "SizaCloud Isaziso: Ithikithi {ticket} ({name}), sicela ugodle uye ku-counter ye-{dept} MANJE.",
        'transferred': "SizaCloud Ukudlulisa: Ithikithi {ticket} lisiwe ku-{dept} ({priority})."
    }
}

def get_localized_sms(template_key: str, lang: str, **kwargs) -> str:
    lang_dict = SMS_TEMPLATES.get(lang, SMS_TEMPLATES['en'])
    template = lang_dict.get(template_key, SMS_TEMPLATES['en'][template_key])
    return template.format(**kwargs)


def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get("RDS_HOSTNAME", "localhost"),
        database=os.environ.get("RDS_DB_NAME", "sizacloud"),
        user=os.environ.get("RDS_USERNAME", "postgres"),
        password=os.environ.get("RDS_PASSWORD", "localdevpassword"),
        port=int(os.environ.get("RDS_PORT", 5432)),
        cursor_factory=RealDictCursor
    )


def send_sns_sms(conn, phone_number: str, message: str, lang: str = 'en') -> str:
    delivery_mode = f"Amazon SNS ({REGION} - {lang.upper()})"
    try:
        sns_client = boto3.client("sns", region_name=REGION)
        sns_client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SenderID": {"DataType": "String", "StringValue": "SizaCloud"},
                "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"}
            }
        )
    except (NoCredentialsError, BotoCoreError, ClientError):
        delivery_mode = f"Amazon SNS Local Sandbox ({lang.upper()})"

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO sns_audit_logs (phone_number, message, aws_service) VALUES (%s, %s, %s);",
            (phone_number, message, delivery_mode)
        )
    conn.commit()
    return delivery_mode


@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        conn = get_db_connection()
        conn.close()
        return jsonify({"status": "HEALTHY", "region": REGION, "rds_connected": True}), 200
    except Exception as e:
        return jsonify({"status": "DEGRADED", "region": REGION, "error": str(e)}), 500


@app.route("/api/state", methods=["GET"])
def get_full_state():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM departments ORDER BY dept_id;")
            departments = cur.fetchall()

            cur.execute("""
                SELECT t.*, d.dept_name, d.dept_code
                FROM queue_tickets t
                JOIN departments d ON t.dept_id = d.dept_id
                ORDER BY
                    CASE t.priority
                        WHEN 'URGENT' THEN 1
                        WHEN 'ELDERLY' THEN 2
                        ELSE 3
                    END,
                    t.created_at ASC;
            """)
            tickets = cur.fetchall()

            cur.execute("SELECT * FROM medication_inventory ORDER BY med_id;")
            medications = cur.fetchall()

            cur.execute("SELECT * FROM sns_audit_logs ORDER BY sent_at DESC LIMIT 15;")
            sns_logs = cur.fetchall()

            return jsonify({
                "departments": departments,
                "tickets": tickets,
                "medications": medications,
                "sns_logs": sns_logs
            })
    finally:
        conn.close()


@app.route("/api/tickets", methods=["POST"])
def create_ticket():
    data = request.get_json() or {}
    patient_name = data.get("patient_name", "Walk-In Citizen").strip()
    patient_phone = data.get("patient_phone", "+27820000000").strip()
    dept_id = int(data.get("dept_id", 1))
    priority = data.get("priority", "STANDARD").upper()
    lang = data.get("language_preference", "en").lower()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM departments WHERE dept_id = %s;", (dept_id,))
            dept = cur.fetchone()
            if not dept:
                return jsonify({"error": "Department not found"}), 404

            cur.execute("SELECT COUNT(*) AS waiting FROM queue_tickets WHERE dept_id = %s AND status = 'WAITING';", (dept_id,))
            waiting_ahead = cur.fetchone()["waiting"]

            cur.execute("SELECT COUNT(*) AS count FROM queue_tickets WHERE dept_id = %s;", (dept_id,))
            total_dept_tickets = cur.fetchone()["count"]

            ticket_number = f"{dept['dept_code']}-{101 + total_dept_tickets}"
            est_wait = int((waiting_ahead * dept["avg_service_time_mins"]) / max(1, dept["active_counters"]))

            cur.execute("""
                INSERT INTO queue_tickets (ticket_number, patient_name, patient_phone, dept_id, priority, status, language_preference)
                VALUES (%s, %s, %s, %s, %s, 'WAITING', %s)
                RETURNING *;
            """, (ticket_number, patient_name, patient_phone, dept_id, priority, lang))
            new_ticket = cur.fetchone()
            conn.commit()

            sms_msg = get_localized_sms(
                'confirmed', lang,
                ticket=ticket_number, dept=dept['dept_name'], priority=priority,
                waiting=waiting_ahead, wait=est_wait
            )
            send_sns_sms(conn, patient_phone, sms_msg, lang)

            return jsonify({
                "ticket": new_ticket,
                "estimated_wait_mins": est_wait,
                "waiting_ahead": waiting_ahead
            }), 201
    finally:
        conn.close()


@app.route("/api/marshal/call-next", methods=["POST"])
def call_next_patient():
    data = request.get_json() or {}
    dept_id = int(data.get("dept_id", 1))

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE queue_tickets SET status = 'SERVED' WHERE dept_id = %s AND status = 'SERVING';", (dept_id,))

            cur.execute("""
                SELECT * FROM queue_tickets
                WHERE dept_id = %s AND status = 'WAITING'
                ORDER BY CASE priority WHEN 'URGENT' THEN 1 WHEN 'ELDERLY' THEN 2 ELSE 3 END, created_at ASC
                LIMIT 1;
            """, (dept_id,))
            next_ticket = cur.fetchone()

            if not next_ticket:
                conn.commit()
                return jsonify({"message": "No waiting patients", "called_ticket": None}), 200

            cur.execute("UPDATE queue_tickets SET status = 'SERVING' WHERE ticket_id = %s RETURNING *;", (next_ticket["ticket_id"],))
            updated = cur.fetchone()
            conn.commit()

            lang = updated.get("language_preference", "en")
            sms_msg = get_localized_sms('called', lang, ticket=updated["ticket_number"], name=updated["patient_name"], dept=updated["ticket_number"].split('-')[0])
            send_sns_sms(conn, updated["patient_phone"], sms_msg, lang)

            return jsonify({"called_ticket": updated}), 200
    finally:
        conn.close()


@app.route("/api/marshal/transfer-ticket", methods=["POST"])
def transfer_ticket():
    data = request.get_json() or {}
    ticket_id = int(data.get("ticket_id"))
    target_dept_id = int(data.get("target_dept_id", 1)) # Default Main Pharmacy
    new_priority = data.get("priority", "URGENT").upper()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM departments WHERE dept_id = %s;", (target_dept_id,))
            target_dept = cur.fetchone()
            if not target_dept:
                return jsonify({"error": "Target department not found"}), 404

            cur.execute("SELECT COUNT(*) AS count FROM queue_tickets WHERE dept_id = %s;", (target_dept_id,))
            count = cur.fetchone()["count"]
            new_ticket_number = f"{target_dept['dept_code']}-{101 + count}"

            cur.execute("""
                UPDATE queue_tickets
                SET dept_id = %s,
                    ticket_number = %s,
                    status = 'WAITING',
                    priority = %s
                WHERE ticket_id = %s
                RETURNING *;
            """, (target_dept_id, new_ticket_number, new_priority, ticket_id))
            transferred = cur.fetchone()
            conn.commit()

            lang = transferred.get("language_preference", "en")
            sms_msg = get_localized_sms(
                'transferred', lang,
                ticket=new_ticket_number, dept=target_dept['dept_name'], priority=new_priority
            )
            send_sns_sms(conn, transferred["patient_phone"], sms_msg, lang)

            return jsonify({
                "message": f"Successfully transferred to {target_dept['dept_name']}",
                "transferred_ticket": transferred
            }), 200
    finally:
        conn.close()


@app.route("/api/medications/update", methods=["POST"])
def update_medication():
    data = request.get_json() or {}
    med_id = int(data.get("med_id", 1))
    delta = int(data.get("delta", 0))

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE medication_inventory
                SET stock_qty = GREATEST(0, stock_qty + %s), updated_at = CURRENT_TIMESTAMP
                WHERE med_id = %s
                RETURNING *;
            """, (delta, med_id))
            med = cur.fetchone()
            conn.commit()

            if delta > 0 and med:
                send_sns_sms(conn, "+27820001111", f"Restock Alert: {med['med_name']} is now available ({med['stock_qty']} units).", 'en')
            return jsonify({"medication": med}), 200
    finally:
        conn.close()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)