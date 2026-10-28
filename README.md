# SizaCloud Health 🏥

> **Public Clinic Queue & Chronic Medication Dispatch System**  
> *Built for South African Public Healthcare resilience.*

---

## What It Does
SizaCloud Health is a cloud-native, multi-tenant public clinic queue management and chronic medication dispatch system. It solves severe healthcare bottlenecks—such as overcrowding and wasted transport fares—by replacing physical pre-dawn queues with a zero-rated **USSD (`*134*7492#`)** and web portal ticketing system.

---

## Key Features
* **Zero-Rated USSD Portal (`*134*7492#`):** Allows patients with basic feature phones or zero data to book queue tickets, check wait times, and verify chronic medicine stock without incurring airtime or data costs.
* **Real-Time Triage & Voice Callouts:** Integrated browser Web Speech API and waiting room TV ticker banners that audibly announce patient names and ticket numbers across department counters.
* **Multilingual Support:** Dynamic SMS notifications and USSD menus available in **English**, **Xitsonga**, and **isiZulu**.
* **Inter-Departmental Clinical Transfers:** Enables seamless patient routing from diagnostic units (X-Ray / CT Scan) directly into the Main Pharmacy queue with priority status.
* **Supply Chain Transparency:** Live chronic medication stock tracking (Metformin, Amlodipine, TLD ARVs, Asthma Inhalers) to prevent wasted, costly taxi trips when medications are out of stock.

---

##  Cloud Architecture & AWS Stack
Designed as an institutional portfolio piece demonstrating practical mastery of the **AWS re/Start** cloud curriculum:
* **Region:** AWS Africa (Cape Town) — `af-south-1`
* **Compute:** Amazon EC2 Auto Scaling groups running behind an Application Load Balancer (ALB) for dynamic scaling during 06:00 AM clinic rushes.
* **Database:** Amazon RDS PostgreSQL for ACID-compliant transactional integrity and relational queue tracking.
* **Messaging & Logging:** Amazon SNS (Simple Notification Service) for multilingual SMS dispatch and Amazon S3 for encrypted daily throughput logs.
* **Security:** IAM Instance Profiles adhering to the principle of least privilege, isolated private database subnets, and automated Linux hardening via Bash bootstrap scripts.

---

## Local Development Setup

### Prerequisites
* Docker & Docker Compose
* Python 3.9+ & Node.js 18+

### Quick Start (Docker Compose)
1. Clone the repository:
   ```bash
   git clone [https://github.com/Twisisani/SizaCloud-Health.git](https://github.com/Twisisani/SizaCloud-Health.git)
   cd SizaCloud-Health

2. Run application
   * docker compose up --build -d
   * npm install
   * npm run dev
