import * as Join from 'joi';

export const envValidationSchema = Join.object({
    NODE_ENV: Join.string()
        .valid('development', 'production', 'test')
        .default('development'),

    PORT: Join.number().port().default(3000),

    DATABASE_URL: Join.string().uri().required(),
    DATABASE_SSL_CA_FILE: Join.string().min(1).when('NODE_ENV', {
        is: 'production', then: Join.required(), otherwise: Join.optional(),
    }),
    FRONTEND_ORIGIN: Join.string().custom((value, helpers) => {
        try {
            const origin = new URL(value);
            if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)) {
                return helpers.error('string.uri');
            }
            if (helpers.state.ancestors[0]?.NODE_ENV === 'production' && origin.protocol !== 'https:') {
                return helpers.error('string.uri');
            }
            return value;
        } catch {
            return helpers.error('string.uri');
        }
    }).when('NODE_ENV', { is: 'production', then: Join.required(), otherwise: Join.optional() }),

    JWT_SECRET: Join.string().min(32).required(),
    RESET_CODE_SECRET: Join.string().min(32).optional(),
    SMTP_HOST: Join.string().min(1).optional(),
    SMTP_PORT: Join.number().port().optional(),
    SMTP_SECURE: Join.string().valid('true', 'false').optional(),
    SMTP_USER: Join.string().min(1).optional(),
    SMTP_PASSWORD: Join.string().min(1).optional(),
    SMTP_FROM: Join.string().email().optional(),

    JWT_EXPIRES_IN: Join.string().default('1h'),
    SWAGGER_ENABLED: Join.string().valid('true', 'false').default('false'),
    CONTRACT_STORAGE_PROVIDER: Join.string().valid('local','s3').default('local'),
    CONTRACT_LOCAL_STORAGE_PATH: Join.string().min(1).default('./storage/contratos'),
    CONTRACT_S3_ENDPOINT: Join.string().uri().pattern(/^https:\/\//).when('CONTRACT_STORAGE_PROVIDER',{is:'s3',then:Join.required(),otherwise:Join.optional()}),
    CONTRACT_S3_REGION: Join.string().min(1).when('CONTRACT_STORAGE_PROVIDER',{is:'s3',then:Join.required(),otherwise:Join.optional()}),
    CONTRACT_S3_BUCKET: Join.string().min(1).when('CONTRACT_STORAGE_PROVIDER',{is:'s3',then:Join.required(),otherwise:Join.optional()}),
    CONTRACT_S3_ACCESS_KEY: Join.string().min(1).when('CONTRACT_STORAGE_PROVIDER',{is:'s3',then:Join.required(),otherwise:Join.optional()}),
    CONTRACT_S3_SECRET_KEY: Join.string().min(1).when('CONTRACT_STORAGE_PROVIDER',{is:'s3',then:Join.required(),otherwise:Join.optional()}),
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
    }).and('SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM').options({
    allowUnknown: true,
    abortEarly: false, 
}); 
