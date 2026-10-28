-- SizaCloud PostgreSQL Schema (Amazon RDS af-south-1) - Multilingual & Transfer Enabled

DROP TABLE IF EXISTS sns_audit_logs CASCADE;
DROP TABLE IF EXISTS queue_tickets CASCADE;
DROP TABLE IF EXISTS medication_inventory CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

CREATE TABLE departments (
    dept_id SERIAL PRIMARY KEY,
    dept_code VARCHAR(10) NOT NULL UNIQUE,
    dept_name VARCHAR(100) NOT NULL UNIQUE,
    avg_service_time_mins INT NOT NULL DEFAULT 10,
    active_counters INT NOT NULL DEFAULT 2
);

CREATE TABLE queue_tickets (
    ticket_id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(20) NOT NULL UNIQUE,
    patient_name VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
    priority VARCHAR(20) NOT NULL DEFAULT 'STANDARD', -- STANDARD, ELDERLY, URGENT
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING',    -- WAITING, SERVING, SERVED, NO_SHOW
    language_preference VARCHAR(5) NOT NULL DEFAULT 'en', -- 'en', 'ts' (Xitsonga), 'zu' (isiZulu)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE medication_inventory (
    med_id SERIAL PRIMARY KEY,
    med_name VARCHAR(120) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    stock_qty INT NOT NULL DEFAULT 0,
    reorder_threshold INT NOT NULL DEFAULT 50,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sns_audit_logs (
    log_id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    aws_service VARCHAR(50) DEFAULT 'Amazon SNS (af-south-1)',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_dept_status ON queue_tickets(dept_id, status);

-- Seed Hospital Departments
INSERT INTO departments (dept_code, dept_name, avg_service_time_mins, active_counters) VALUES
('MPHM', 'Main Pharmacy', 8, 3),
('PPHM', 'Paediatric Pharmacy', 10, 2),
('XRAY', 'X-Ray Department', 15, 2),
('CTSC', 'CT Scan Unit', 25, 1);

-- Seed Chronic Medication Inventory
INSERT INTO medication_inventory (med_name, category, stock_qty, reorder_threshold) VALUES
('Metformin 500mg (Diabetes)', 'Chronic - Endocrinology', 420, 100),
('Amlodipine 5mg (Hypertension)', 'Chronic - Cardiology', 310, 80),
('TLD Fixed-Dose ARV (HIV/AIDS)', 'Chronic - Virology', 580, 150),
('Salbutamol 100mcg Inhaler (Asthma)', 'Respiratory', 0, 40),
('Amoxicillin 125mg/5ml Suspension', 'Paediatric Antibiotic', 95, 30);