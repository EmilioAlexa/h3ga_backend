import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** Barrera de regresión: inventario AST de escritores, no ejecuta SQL. */
describe('Protección de persistencia y compatibilidad', () => {
  it('no hay escritores preexistentes de modalidades fuera del módulo autorizado', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'generated') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) files.push(path);
      }
    };
    walk('src');
    const writes: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const access = node.expression;
          if (['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(access.name.text) &&
              ts.isPropertyAccessExpression(access.expression) && access.expression.name.text === 'modalidades_aplicacion') writes.push(file.replaceAll('\\', '/'));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(writes.length).toBeGreaterThan(0);
    expect(new Set(writes)).toEqual(new Set(['src/gestion/modalidades/modalidades.service.ts']));
  });
  it('SQL preparado es aditivo y no atribuye campos compartidos ni escribe Finanzas', () => {
    const raw = readFileSync('prisma/migrations/20261120120000_modalidades_seguimiento_independiente/migration.sql', 'utf8');
    const sql = raw.replace(/--[^\n]*/g, '');
    expect(sql).toContain('BEGIN;'); expect(sql).toContain('COMMIT;');
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/i);
    expect(sql.match(/CREATE TABLE\s+"([^"]+)"/g)).toEqual(['CREATE TABLE "modalidades_seguimiento"']);
    expect(sql.match(/INSERT INTO\s+"([^"]+)"/g)).toEqual(['INSERT INTO "modalidades_seguimiento"']);
    expect(sql).not.toMatch(/m\.(fecha_cita_imss|ultimo_salario_diario_registrado|motivo_cierre)/);
    expect(sql).toContain('HAVING count(*) > 1');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('modalidades_seguimiento_individual_check');
  });
});
