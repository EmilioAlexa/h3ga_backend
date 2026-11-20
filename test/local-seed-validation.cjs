const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { CreateClienteDto } = require('../dist/clientes/dto/create-cliente.dto.js');

async function main() {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: 'body', metatype: CreateClienteDto };
  const input = { nombre: ' Cliente Test ', apellido_paterno: ' Integracion Local 2026 ' };
  const valid = await pipe.transform(input, metadata);
  assert.equal(valid.nombre, 'Cliente Test');
  assert.equal(valid.apellido_paterno, 'Integracion Local 2026');
  await assert.rejects(() => pipe.transform({ ...input, asesor_id: 'invalido' }, metadata));
  await assert.rejects(() => pipe.transform({ ...input, referido_por_cliente_id: 'invalido' }, metadata));
  console.log('Validación de DTO de clientes: correcta; sin conexión ni escrituras.');
}
main().catch(() => { console.error('Falló la validación del DTO de clientes'); process.exitCode = 1; });
