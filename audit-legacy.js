const path = require('path');
const fs = require('fs');

const legacyPath = path.join(require('electron').app.getPath('userData'), 'nexo-db.json');
if (fs.existsSync(legacyPath)) {
    const raw = fs.readFileSync(legacyPath, 'utf-8');
    const p = JSON.parse(raw);
    console.log('--- AUDITORÍA DE MIGRACIÓN ---');
    console.log('Keys raíz:', Object.keys(p));
    console.log('¿Tiene contactsData?:', !!p.contactsData);
    console.log('¿Es un Array?:', Array.isArray(p));
    if (p.contactsData) {
        console.log('Longitud de contactsData:', p.contactsData.length);
    }
} else {
    console.log('No existe archivo legacy');
}
