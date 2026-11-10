export default () => ({
    environment: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    database: {
        url: process.env.DATABASE_URL,
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    },
    swagger: {
        enabled: (process.env.SWAGGER_ENABLED ?? 'false').toLowerCase() === 'true',
    },
    storage: {
        provider: process.env.STORAGE_PROVIDER ?? 'local',
        localPath: process.env.LOCAL_STORAGE_PATH ?? './storage/evidencias',
        maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '10', 10),
        s3: {
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION,
            bucket: process.env.S3_BUCKET,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
        },
    },
}); 
