import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { median, mean, stddev, summarize, validPh } from "../assets/js/modules/stats.js";
import { interpretValue } from "../assets/js/modules/agronomy.js";
import { toCSV } from "../assets/js/modules/csv.js";
import { deduplicateOperations } from "../assets/js/modules/sync.js";
import { trendText } from "../assets/js/modules/charts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agronomy = JSON.parse(fs.readFileSync(path.join(root, "config/agronomy.json"), "utf8"));
const demo = JSON.parse(fs.readFileSync(path.join(root, "config/demo-data.json"), "utf8"));

test("estadística usa mediana como valor representativo", () => {
  const values = [5, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 6, 6.1, 8];
  assert.equal(median(values), 5.55);
  assert.ok(mean(values) > median(values));
  assert.ok(stddev(values) > 0);
  assert.equal(summarize(values).count, 10);
});

test("ignora lecturas inválidas", () => {
  assert.equal(validPh(-1), false);
  assert.equal(validPh(14.1), false);
  assert.equal(validPh(""), false);
  assert.equal(summarize([5, 5.5, -1, 18]).count, 2);
});

test("interpreta los cinco niveles provisionales de café", () => {
  assert.equal(interpretValue(4.3, "coffee", agronomy).label, "Muy bajo");
  assert.equal(interpretValue(4.8, "coffee", agronomy).label, "Bajo");
  assert.equal(interpretValue(5.3, "coffee", agronomy).label, "Moderadamente ácido");
  assert.equal(interpretValue(5.8, "coffee", agronomy).label, "Adecuado");
  assert.equal(interpretValue(7, "coffee", agronomy).label, "Alto");
  assert.equal(interpretValue(5.8, "coffee", agronomy).provisional, true);
});

test("cada técnico tiene cinco fincas ficticias", () => {
  demo.technicians.forEach(technician => assert.equal(demo.farms.filter(farm => farm.technician_id === technician.id).length, 5));
  assert.equal(new Set(demo.farms.map(farm => farm.id)).size, 15);
});

test("cada finca tiene tres lotes relacionados", () => {
  demo.farms.forEach(farm => assert.equal(demo.lots.filter(lot => lot.farm_id === farm.id).length, 3));
});

test("CSV escapa comillas, comas y saltos", () => {
  const csv = toCSV([{ lote: 'Norte, "A"', nota: "línea 1\nlínea 2" }]);
  assert.match(csv, /"Norte, ""A"""/);
  assert.match(csv, /"línea 1\nlínea 2"/);
});

test("deduplica operaciones por entidad y registro", () => {
  const result = deduplicateOperations([
    { id: "a", entity: "measurements", record_id: "m1" },
    { id: "b", entity: "measurements", record_id: "m1" },
    { id: "c", entity: "sessions", record_id: "s1" }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find(item => item.record_id === "m1").id, "b");
});

test("tendencia se deriva de valores", () => {
  assert.match(trendText([{ value: 5 }, { value: 5.4 }]), /ascendente/);
  assert.match(trendText([{ value: 5.5 }, { value: 5.1 }]), /descendente/);
  assert.match(trendText([{ value: 5.5 }, { value: 5.55 }]), /estable/);
});

test("Service Worker usa caché versionado y lista estática", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /ph-cultivos-fase1-v0\.1\.0/);
  assert.match(sw, /allowed\.has/);
  assert.doesNotMatch(sw, /supabase\.co/);
  const paths = [...sw.matchAll(/"\.\/([^"\n]+)"/g)].map(match => match[1]).filter(file => file && file !== "");
  paths.forEach(file => assert.equal(fs.existsSync(path.join(root, file)), true, `Falta ${file}`));
});

test("no hay credenciales secretas configuradas", () => {
  const files = ["config/app.example.js", "README.md", "assets/js/app.js", "supabase/migrations/001_schema.sql"];
  const text = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(text, /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i);
  assert.doesNotMatch(text, /supabaseAnonKey:\s*["'][A-Za-z0-9._-]{20,}/i);
});

test("migración prepara RLS para las tablas sensibles", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/001_schema.sql"), "utf8");
  ["profiles", "farms", "lots", "sampling_sessions", "measurements", "audit_events"].forEach(table => {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  });
});
