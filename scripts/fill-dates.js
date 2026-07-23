const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(process.cwd(), 'plugins.json');

function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

const raw = fs.readFileSync(FILE_PATH, 'utf-8');
const plugins = JSON.parse(raw);

let changed = false;
const today = todayISO();

for (const item of plugins) {
    if (!item.dateAdded) {
        item.dateAdded = today;
        changed = true;
        console.log(`dateAdded eklendi: ${item.name} -> ${today}`);
    }
}

if (changed) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(plugins, null, 2) + '\n', 'utf-8');
    console.log('plugins.json guncellendi.');
} else {
    console.log('Bos dateAdded alani bulunamadi, degisiklik yapilmadi.');
}
