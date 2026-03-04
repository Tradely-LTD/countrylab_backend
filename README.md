# CountryLab LMS - Backend API

A comprehensive Laboratory Management System (LMS) backend built with Node.js, Express, TypeScript, and PostgreSQL. This system provides complete laboratory operations management including sample tracking, results management, inventory control, procurement, and financial operations.

## 🚀 Features

### Core Laboratory Operations

#### Sample Management

- **Sample Registration**: Register samples with unique ULID identifiers
- **Sample Tracking**: Track samples through the entire laboratory workflow
- **Sample Status Management**: Manage sample lifecycle (received, in_progress, completed, rejected)
- **Client Association**: Link samples to clients for easy tracking
- **Batch Processing**: Handle multiple samples efficiently
- **Sample History**: Complete audit trail of sample activities

#### Results & Certificates of Analysis (CoA)

- **Test Results Entry**: Record detailed test results with multiple parameters
- **Multi-level Approval**: Support for analyst submission and MD approval workflow
- **Certificate Generation**: Automated PDF generation for Certificates of Analysis
- **QR Code Integration**: Generate QR codes for certificate verification
- **Result Versioning**: Track changes and updates to results
- **Public Verification**: Allow public verification of certificates via QR codes

#### Sample Requests (Public Portal)

- **Public Request Form**: Allow clients to submit sample testing requests online
- **Request Tracking**: Track requests from submission to sample registration
- **Status Updates**: Automated status notifications
- **Invoice Linking**: Link invoices to sample requests
- **Request Management**: Admin interface for processing requests

### Inventory Management

#### Stock & Consumables

- **Reagent Tracking**: Track laboratory reagents and consumables
- **Stock Levels**: Monitor current stock levels and usage
- **Reorder Alerts**: Automatic alerts when stock reaches reorder level
- **Expiry Management**: Track expiry dates and get alerts for expiring items
- **Batch/Lot Tracking**: Track items by batch or lot numbers
- **Usage History**: Complete history of stock movements

#### Assets & Equipment

- **Asset Registry**: Maintain complete asset inventory
- **Calibration Tracking**: Track calibration schedules and history
- **Maintenance Logs**: Record maintenance activities
- **Asset Status**: Monitor operational status of equipment
- **Custodian Assignment**: Assign assets to specific staff members
- **Location Tracking**: Track asset locations within the facility

### Procurement System

#### Requisitions

- **Purchase Requisitions**: Create and manage purchase requisitions
- **Multi-item Support**: Add multiple items per requisition
- **Approval Workflow**: Draft → Pending Approval → Approved/Rejected
- **Department Tracking**: Track requisitions by department
- **Urgency Levels**: Set priority levels (normal, urgent, emergency)
- **Requisition History**: Complete audit trail

#### Purchase Orders

- **PO Generation**: Generate purchase orders from approved requisitions
- **Supplier Management**: Link POs to suppliers
- **PO Tracking**: Track PO status from creation to fulfillment
- **Multi-currency Support**: Handle different currencies
- **PO History**: Complete purchase order history

#### Suppliers

- **Supplier Database**: Maintain comprehensive supplier information
- **Contact Management**: Store supplier contacts and details
- **Payment Terms**: Track payment terms and conditions
- **Supplier History**: View purchase history per supplier
- **Performance Tracking**: Monitor supplier performance

### Financial Management

#### Invoicing

- **Invoice Generation**: Create professional invoices
- **Line Item Support**: Multiple line items per invoice
- **Tax Calculation**: Automatic tax calculation (VAT support)
- **Payment Tracking**: Track payment status (unpaid, paid, partial, voided)
- **Client Linking**: Link invoices to clients and samples
- **Invoice History**: Complete invoice history and reporting

#### Revenue Tracking

- **Monthly Revenue**: Track revenue by month
- **Payment Methods**: Record different payment methods
- **Financial Reports**: Generate financial summaries
- **Due Date Management**: Track invoice due dates

### Client Management

- **Client Database**: Comprehensive client information management
- **Contact Details**: Store multiple contact methods
- **Client History**: View complete client interaction history
- **Sample Tracking**: View all samples submitted by client
- **Invoice History**: View all invoices for each client
- **Notes & Documentation**: Add notes and documentation per client

### User & Access Management

#### Multi-tenancy

- **Tenant Isolation**: Complete data isolation per organization
- **Tenant Configuration**: Customizable settings per tenant
- **Schema Management**: Dynamic schema creation per tenant

#### Role-Based Access Control (RBAC)

- **Super Admin**: Full system access
- **MD (Managing Director)**: Executive access and approvals
- **Quality Manager**: Quality control and team management
- **Lab Analyst**: Sample and results management (read-only for clients/suppliers)
- **Procurement Officer**: Procurement and supplier management
- **Inventory Manager**: Inventory and asset management
- **Finance**: Financial operations and invoicing
- **Business Development**: Client and invoice management
- **Customer**: Limited external access

#### Authentication & Security

- **Supabase Integration**: Secure authentication via Supabase
- **JWT Tokens**: Token-based authentication
- **Password Reset**: Secure password reset flow
- **2FA Support**: Two-factor authentication for sensitive roles
- **Session Management**: Secure session handling

### Audit & Compliance

#### Audit Logging

- **Complete Audit Trail**: Log all CRUD operations
- **User Tracking**: Track which user performed each action
- **Timestamp Recording**: Precise timestamps for all actions
- **Change History**: Before/after values for updates
- **IP Address Logging**: Record IP addresses for security
- **Audit Reports**: Generate audit reports by date, user, or action

#### Notifications

- **System Notifications**: In-app notification system
- **Email Notifications**: Email alerts for important events
- **Notification Preferences**: User-configurable notification settings
- **Read/Unread Tracking**: Track notification status

### Dashboard & Analytics

- **Sample Statistics**: Real-time sample status overview
- **Pending Approvals**: Track items awaiting approval
- **Inventory Alerts**: Low stock and expiring items alerts
- **Calibration Alerts**: Equipment calibration due alerts
- **Revenue Metrics**: Financial performance metrics
- **Recent Activity**: Latest system activities

### Settings & Configuration

- **Organization Settings**: Configure organization details
- **Logo Upload**: Custom organization logo
- **Email Templates**: Customizable email templates
- **System Preferences**: Configure system-wide settings
- **Notification Settings**: Configure notification preferences

## 🛠 Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Authentication**: Supabase Auth
- **File Storage**: Local file system (configurable)
- **PDF Generation**: PDFKit
- **QR Codes**: qrcode library
- **Barcode Generation**: bwip-js
- **Email**: Nodemailer
- **Validation**: Zod
- **Logging**: Winston

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Supabase account (for authentication)
- npm or yarn

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/Tradely-LTD/countrylab_backend.git
cd countrylab_backend

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/countrylab_lms

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# JWT
JWT_SECRET=your_jwt_secret

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_password

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5174
```

### Database Setup

```bash
# Run migrations
npm run migrate

# Seed admin user (optional)
npm run seed:admin
```

### Running the Application

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your_token>
```

### Main Endpoints

#### Authentication

- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password
- `GET /auth/me` - Get current user

#### Samples

- `GET /samples` - List all samples
- `POST /samples` - Create new sample
- `GET /samples/:id` - Get sample details
- `PUT /samples/:id` - Update sample
- `DELETE /samples/:id` - Delete sample

#### Results

- `GET /results` - List all results
- `POST /results` - Create new result
- `GET /results/:id` - Get result details
- `PUT /results/:id` - Update result
- `PATCH /results/:id/submit` - Submit for approval
- `PATCH /results/:id/approve` - Approve result
- `GET /results/:id/certificate` - Generate CoA PDF

#### Sample Requests

- `GET /sample-requests` - List all requests
- `POST /sample-requests` - Create new request (public)
- `GET /sample-requests/:id` - Get request details
- `PATCH /sample-requests/:id/status` - Update request status

#### Inventory

- `GET /inventory` - List reagents/consumables
- `POST /inventory` - Add new item
- `PUT /inventory/:id` - Update item
- `PATCH /inventory/:id/adjust` - Adjust stock level

#### Assets

- `GET /assets` - List all assets
- `POST /assets` - Add new asset
- `PUT /assets/:id` - Update asset
- `POST /assets/:id/log` - Log maintenance/calibration

#### Procurement

- `GET /procurement/requisitions` - List requisitions
- `POST /procurement/requisitions` - Create requisition
- `PATCH /procurement/requisitions/:id/approve` - Approve/reject
- `GET /procurement/purchase-orders` - List purchase orders
- `POST /procurement/purchase-orders` - Create PO

#### Suppliers

- `GET /suppliers` - List suppliers
- `POST /suppliers` - Add supplier
- `PUT /suppliers/:id` - Update supplier
- `GET /suppliers/:id/history` - Get supplier history

#### Clients

- `GET /clients` - List clients
- `POST /clients` - Add client
- `PUT /clients/:id` - Update client
- `GET /clients/:id/history` - Get client history

#### Invoices

- `GET /invoices` - List invoices
- `POST /invoices` - Create invoice
- `PUT /invoices/:id` - Update invoice
- `PATCH /invoices/:id/payment` - Mark as paid
- `DELETE /invoices/:id` - Void invoice

#### Users & Team

- `GET /users` - List users
- `POST /users` - Create user
- `PATCH /users/:id` - Update user
- `GET /users/me` - Get current user profile

#### Audit Logs

- `GET /audit-logs` - List audit logs (filtered)

#### Dashboard

- `GET /dashboard/widgets` - Get dashboard statistics
- `GET /dashboard/recent-activity` - Get recent activities

## 🔒 Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Password hashing with bcrypt
- SQL injection prevention via parameterized queries
- XSS protection
- CORS configuration
- Rate limiting (recommended for production)
- Audit logging for all operations
- Tenant data isolation

## 📦 Database Schema

The system uses a multi-tenant PostgreSQL database with the following main tables:

- `tenants` - Organization/tenant information
- `users` - User accounts and authentication
- `clients` - Client/customer information
- `samples` - Laboratory samples
- `results` - Test results and CoA data
- `sample_requests` - Public sample requests
- `reagents` - Inventory items (consumables)
- `assets` - Laboratory equipment and assets
- `requisitions` - Purchase requisitions
- `purchase_orders` - Purchase orders
- `suppliers` - Supplier information
- `invoices` - Financial invoices
- `audit_logs` - System audit trail
- `notifications` - User notifications

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run seed:admin` - Seed admin user
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software owned by Tradely LTD.

## 👥 Support

For support, email support@countrylab.com or contact the development team.

## 🔄 Version History

- **v1.0.0** - Initial release with core LMS features
- **v1.1.0** - Added role-based access control for clients and suppliers
