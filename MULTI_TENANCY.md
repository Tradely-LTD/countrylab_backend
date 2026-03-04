# Multi-Tenancy Setup Guide

This application uses **schema-based multi-tenancy** with PostgreSQL. Each project/tenant gets its own database schema while sharing the same database instance.

## Architecture

- **Database Instance**: Single Supabase PostgreSQL instance
- **Schema Isolation**: Each project uses a dedicated schema (e.g., `countrylab_lms`, `project_alpha`)
- **Connection**: Same connection string, different `search_path`

## Benefits

✅ **Data Isolation**: Complete separation between projects  
✅ **Cost Effective**: Share one database instance  
✅ **Easy Backup**: Backup per schema or entire database  
✅ **Scalable**: Add new projects without new databases  
✅ **Simple Migrations**: Run migrations per schema

## Configuration

### 1. Environment Variables

Set the schema name in your `.env` file:

```env
DATABASE_URL=postgresql://postgres.xxx:password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
DATABASE_SCHEMA=countrylab_lms
```

### 2. Schema Management

#### Create Schema

```bash
npm run schema:create
# or with custom name
npm run schema:manage create my_project
```

#### List All Schemas

```bash
npm run schema:list
```

#### Check if Schema Exists

```bash
npm run schema:manage exists countrylab_lms
```

#### Drop Schema (Caution!)

```bash
npm run schema:manage drop old_project --cascade
```

#### Clone Schema Structure

```bash
npm run schema:manage clone countrylab_lms new_project
```

## Database Migrations

### Generate Migrations

```bash
npm run db:generate
```

This creates migration files in `src/db/migrations/` for the configured schema.

### Push Schema Changes

```bash
npm run db:push
```

This applies the schema to your configured `DATABASE_SCHEMA`.

### Drizzle Studio

```bash
npm run db:studio
```

Opens Drizzle Studio connected to your schema.

## How It Works

### 1. Connection Pool Setup

The database connection automatically sets `search_path` for all connections:

```typescript
pool.on("connect", async (client) => {
  await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
});
```

### 2. Schema Initialization

On server startup, the schema is created if it doesn't exist:

```typescript
await initializeSchema(); // Creates schema
await checkDbConnection(); // Verifies connection
```

### 3. Query Execution

All queries automatically use the configured schema:

```typescript
// This query runs in the 'countrylab_lms' schema
const samples = await db.select().from(schema.samples);
```

## Deploying Multiple Projects

### Same Database, Different Schemas

1. **Project A** (Countrylab LMS)

   ```env
   DATABASE_URL=postgresql://...
   DATABASE_SCHEMA=countrylab_lms
   ```

2. **Project B** (Attendance System)

   ```env
   DATABASE_URL=postgresql://...
   DATABASE_SCHEMA=attendance_system
   ```

3. **Project C** (Inventory Manager)
   ```env
   DATABASE_URL=postgresql://...
   DATABASE_SCHEMA=inventory_manager
   ```

All three projects share the same database but have completely isolated data.

## Best Practices

### Schema Naming

- Use lowercase with underscores: `countrylab_lms`, `project_alpha`
- Avoid special characters and spaces
- Keep names descriptive but concise

### Security

- Never use the `public` schema for production data
- Each project should only access its own schema
- Use separate database users per project (optional but recommended)

### Backups

```bash
# Backup specific schema
pg_dump -h host -U user -n countrylab_lms dbname > backup.sql

# Restore specific schema
psql -h host -U user dbname < backup.sql
```

### Migrations

- Always test migrations on a development schema first
- Keep migration files in version control
- Document breaking changes

## Troubleshooting

### Schema Not Found

```
Error: schema "countrylab_lms" does not exist
```

**Solution**: Run `npm run schema:create`

### Wrong Schema

```
Error: relation "samples" does not exist
```

**Solution**: Check `DATABASE_SCHEMA` in `.env` and verify schema exists

### Permission Denied

```
Error: permission denied for schema countrylab_lms
```

**Solution**: Ensure database user has permissions:

```sql
GRANT ALL ON SCHEMA countrylab_lms TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA countrylab_lms TO your_user;
```

## Advanced: Programmatic Schema Switching

```typescript
import { SchemaManager } from "./db/schema-manager";
import { pool } from "./db";

const schemaManager = new SchemaManager(pool);

// Switch to different schema
await schemaManager.setSearchPath("another_project");

// Execute queries in that schema
const data = await db.select().from(samples);
```

## Monitoring

Check current schema in health endpoint:

```bash
curl http://localhost:3001/health
```

Response includes:

```json
{
  "status": "ok",
  "schema": "countrylab_lms",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Migration from Public Schema

If you have existing data in the `public` schema:

```sql
-- Create new schema
CREATE SCHEMA countrylab_lms;

-- Move tables
ALTER TABLE public.samples SET SCHEMA countrylab_lms;
ALTER TABLE public.results SET SCHEMA countrylab_lms;
-- ... repeat for all tables

-- Update search_path
SET search_path TO countrylab_lms, public;
```

## Resources

- [PostgreSQL Schemas Documentation](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Supabase Multi-tenancy Guide](https://supabase.com/docs/guides/database/multi-tenancy)
