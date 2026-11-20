const base = 'http://127.0.0.1:3000/api';

async function assertStatus(path, options, expected) {
  const response = await fetch(`${base}${path}`, options);
  if (response.status !== expected) {
    throw new Error(`${path}: se esperaba HTTP ${expected}, llegó ${response.status}`);
  }
  return response;
}

async function main() {
  await assertStatus('/auth/me', {}, 401);
  await assertStatus('/auth/me', { headers: { Authorization: 'Bearer token-invalido' } }, 401);
  await assertStatus('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo_electronico: 'sin-cuenta@example.test', contrasena: 'clave-inexistente' }),
  }, 401);
  const cors = await assertStatus('/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:7357',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  }, 204);
  if (cors.headers.get('access-control-allow-origin') !== 'http://localhost:7357') {
    throw new Error('CORS no permitió el origen Flutter Web local');
  }
  const rejected = await assertStatus('/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://ejemplo.invalid:7357',
      'Access-Control-Request-Method': 'POST',
    },
  }, 204);
  if (rejected.headers.has('access-control-allow-origin')) {
    throw new Error('CORS permitió un origen no autorizado');
  }
  console.log('HTTP real PostgreSQL Test: /me sin JWT 401, JWT inválido 401, login inexistente 401, CORS local permitido y externo rechazado.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
