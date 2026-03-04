# Quick Start - Schema-Based Multi-Tenancy

## 🚀 Setup in 5 Minutes

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

**Required variables:**

```env
DATABASE_URL=postgresql://postgres.xxx:password@host:5432/postgres
DATABASE_SCHEMA=countrylab_lms
```

### 3. Create Schema & Deploy

```bash
npm run schema:create    # Creates the schema
npm run db:push          # Deploys tables
npm run dev              # Starts server
```

### 4. Verify

```bash
curl http://localhost:3001/health
```

✅ You should see: `"schema": "countrylab_lms"`

---

## 📋 Common Commands

| Command                 | Description              |
| ----------------------- | ------------------------ |
| `npm run dev`           | Start development server |
| `npm run schema:create` | Create database schema   |
| `npm run schema:list`   | List all schemas         |
| `npm run db:generate`   | Generate migrations      |
| `npm run db:push`       | Push schema to database  |
| `npm run db:studio`     | Open Drizzle Studio      |

---

## 🔧 Multi-Project Setup

Deploy multiple projects on the same database:

```bash
# Project 1
DATABASE_SCHEMA=countrylab_lms PORT=3001 npm run dev

# Project 2
DATABASE_SCHEMA=attendance_system PORT=3002 npm run dev

# Project 3
DATABASE_SCHEMA=inventory_manager PORT=3003 npm run dev
```

Each project has isolated data in its own schema.

---

## 🗄️ Schema Management

```bash
# Create new schema
npm run schema:manage create my_project

# Check if schema exists
npm run schema:manage exists countrylab_lms

# Clone schema structure
npm run schema:manage clone countrylab_lms new_project

# Drop schema (careful!)
npm run schema:manage drop old_project --cascade
```

---

## 🐛 Troubleshooting

**Schema not found?**

```bash
npm run schema:create
```

**Tables not found?**

```bash
npm run db:push
```

**Connection issues?**

- Check `DATABASE_URL` in `.env`
- Verify network connectivity
- Confirm database credentials

---

## 📚 More Information

- Full guide: `MULTI_TENANCY.md`
- Deployment: `../DEPLOYMENT_GUIDE.md`
- Schema structure: `src/db/schema/index.ts`

---

## 💡 Key Concepts

**Schema-Based Multi-Tenancy:**

- ✅ One database instance
- ✅ Multiple schemas (one per project)
- ✅ Complete data isolation
- ✅ Cost-effective scaling

**How it works:**

1. Each project uses a unique schema name
2. Connection pool sets `search_path` automatically
3. All queries run in the configured schema
4. Data is completely isolated between projects
