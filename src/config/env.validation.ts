import * as Join from 'joi';

export const envValidationSchema = Join.object({
    NODE_ENV: Join.string()
        .valid('development', 'production', 'test')
        .default('development'),

    PORT: Join.number().port().default(3000),

    DATABASE_URL: Join.string().uri().required(),

    JWT_SECRET: Join.string().min(32).required(),

    JWT_EXPIRES_IN: Join.string().default('1h'),
    SWAGGER_ENABLED: Join.string().valid('true', 'false').default('false'),
    STORAGE_PROVIDER: Join.string().valid('local', 's3').default('local'),
    LOCAL_STORAGE_PATH: Join.string().min(1).default('./storage/evidencias'),
    MAX_FILE_SIZE_MB: Join.number().integer().min(1).max(100).default(10),
    S3_ENDPOINT: Join.string().uri().when('STORAGE_PROVIDER', {
        is: 's3', then: Join.required(), otherwise: Join.optional(),
    }),
    S3_REGION: Join.string().min(1).when('STORAGE_PROVIDER', {
        is: 's3', then: Join.required(), otherwise: Join.optional(),
    }),
    S3_BUCKET: Join.string().min(1).when('STORAGE_PROVIDER', {
        is: 's3', then: Join.required(), otherwise: Join.optional(),
    }),
    S3_ACCESS_KEY: Join.string().min(1).when('STORAGE_PROVIDER', {
        is: 's3', then: Join.required(), otherwise: Join.optional(),
    }),
    S3_SECRET_KEY: Join.string().min(1).when('STORAGE_PROVIDER', {
        is: 's3', then: Join.required(), otherwise: Join.optional(),
    }),
    }).options({
    allowUnknown: true,
    abortEarly: false, 
}); 
