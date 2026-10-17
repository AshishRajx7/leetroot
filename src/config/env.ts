import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://leetroot:leetroot_secret@localhost:5432/leetroot',
    user: process.env.POSTGRES_USER || 'leetroot',
    password: process.env.POSTGRES_PASSWORD || 'leetroot_secret',
    db: process.env.POSTGRES_DB || 'leetroot',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10), // 24 hours
  },
  nim: {
    apiKey: process.env.NVIDIA_NIM_API_KEY || '',
    baseURL: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
    rateLimitRpm: 40, // NVIDIA NIM free tier limit
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },
};
