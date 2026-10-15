import * as Join from 'joi';

export const envValidationSchema = Join.object({
    NODE_ENV: Join.string()
        .valid('development', 'production', 'test')
        .default('development'),

    PORT: Join.number().port().default(3000),

    DATABASE_URL: Join.string().uri().required(),

    JWT_SECRET: Join.string().min(32).required(),

    JWT_EXPIRES_IN: Join.string().default('1h'),
    }).options({
    allowUnknown: true,
    abortEarly: false, 
}); 