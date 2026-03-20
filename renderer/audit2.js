const fs = require('fs');
const path = require('path');
const os = require('os');

// Ruta real de AppData en Windows
const legacyPath = path.join(
  os.homedir(), 
  'AppData', 'Roaming', 'Nexo', 'nexo-db.json'
);

console.log('Buscando en:', legacyPath);

if (!fs.existsSync(legacyPath)) {
  console.log('❌ No existe nexo-db.json — base de datos vacía o nueva instalación');
  process.exit(0);
}

const raw = fs.readFileSync(legacyPath, 'utf-8');
const p = JSON.parse(raw);

console.log('Keys raíz:', Object.keys(p));
console.log('¿Es Array?:', Array.isArray(p));
console.log('¿Tiene contactsData?:', !!p.contactsData);
console.log('¿Tiene contacts?:', !!p.contacts);

if (p.contactsData) console.log('contactsData.length:', p.contactsData.length);
if (p.contacts) console.log('contacts.length:', p.contacts.length);

// Buscar arrays en cualquier profundidad
Object.entries(p).forEach(([k, v]) => {
  if (Array.isArray(v)) console.log(`Array encontrado en clave "${k}": ${v.length} items`);
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    Object.entries(v).forEach(([k2, v2]) => {
      if (Array.isArray(v2)) console.log(`Array en "${k}.${k2}": ${v2.length} items`);
    });
  }
});