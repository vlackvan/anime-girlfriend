# RAG System Setup Guide

This guide explains how to set up and use the RAG (Retrieval-Augmented Generation) system for the Anime Girlfriend extension.

## Prerequisites

- Docker and Docker Compose installed on your system
- Node.js 18+ (already required for VS Code extension development)

## Quick Start

### 1. Start the PostgreSQL Database

From the project root directory, run:

```bash
docker-compose up -d
```

This will:
- Pull the `ankane/pgvector` image
- Create a PostgreSQL container with pgvector extension
- Expose port 5432 on localhost
- Create a persistent volume for data storage

### 2. Verify Database is Running

```bash
docker-compose ps
```

You should see the `anime-girlfriend-postgres` container running.

### 3. Check Database Health

```bash
docker-compose logs postgres
```

Wait until you see "database system is ready to accept connections".

## Configuration

The RAG system can be configured via VS Code settings:

- `anime-girlfriend.database.host`: Database host (default: localhost)
- `anime-girlfriend.database.port`: Database port (default: 5432)
- `anime-girlfriend.database.name`: Database name (default: anime_girlfriend_rag)
- `anime-girlfriend.database.user`: Database user (default: postgres)
- `anime-girlfriend.database.password`: Database password (default: postgres)
- `anime-girlfriend.rag.enabled`: Enable/disable RAG (default: true)
- `anime-girlfriend.rag.maxResults`: Max relevant documents to retrieve (default: 5)

## Database Schema

The RAG system automatically creates the following tables:

### `documents`
- `id`: UUID primary key
- `content`: Text content
- `metadata`: JSONB metadata (file path, problem ID, etc.)
- `created_at`: Timestamp

### `embeddings`
- `id`: UUID primary key
- `document_id`: Foreign key to documents
- `embedding`: Vector (384 dimensions for all-MiniLM-L6-v2)
- `created_at`: Timestamp

An HNSW index is automatically created on the `embedding` column for fast similarity search.

## How It Works

1. **Data Ingestion**: The extension scans your workspace for BOJ solution files (*.cpp, *.py, etc.)
2. **Embedding Generation**: Each document is converted to a 384-dimensional vector using a local transformer model
3. **Vector Storage**: Embeddings are stored in PostgreSQL with pgvector
4. **Retrieval**: When you chat, relevant past solutions and conversations are retrieved using cosine similarity
5. **Augmented Response**: The AI uses retrieved context to provide more personalized and context-aware responses

## Stopping the Database

```bash
docker-compose down
```

To also remove the persistent volume (⚠️ this will delete all stored data):

```bash
docker-compose down -v
```

## Troubleshooting

### Port 5432 already in use

If you have another PostgreSQL instance running:
```bash
# Option 1: Stop the other PostgreSQL
# Option 2: Change the port in docker-compose.yml and package.json configuration
```

### Database connection fails

1. Check if the container is running: `docker-compose ps`
2. Check logs: `docker-compose logs postgres`
3. Verify network connectivity: `docker-compose exec postgres pg_isready -U postgres`

### Extension can't connect to database

1. Ensure Docker container is running
2. Check VS Code settings for correct database credentials
3. Check extension logs in VS Code Developer Tools (Help > Toggle Developer Tools)
