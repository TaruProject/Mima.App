import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../src/i18n/locales');
const languages = ['en', 'es', 'fi', 'sv'];
const masterLang = 'en';

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function check() {
  const masterPath = path.join(localesDir, masterLang, 'common.json');
  if (!fs.existsSync(masterPath)) {
    console.error(`❌ Master language file not found: ${masterPath}`);
    process.exit(1);
  }

  const masterContent = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  const masterKeys = getKeys(masterContent);
  let hasErrors = false;

  languages.forEach((lang) => {
    if (lang === masterLang) return;

    const langPath = path.join(localesDir, lang, 'common.json');
    if (!fs.existsSync(langPath)) {
      console.error(`❌ Language file not found: ${langPath}`);
      hasErrors = true;
      return;
    }

    const langContent = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    const langKeys = getKeys(langContent);

    masterKeys.forEach((key) => {
      if (!langKeys.includes(key)) {
        console.error(`❌ CLAVE FALTANTE: ${lang}/common.json → ${key}`);
        hasErrors = true;
      }
    });

    langKeys.forEach((key) => {
      if (!masterKeys.includes(key)) {
        console.error(`⚠️ CLAVE EXTRA EN ${lang}: ${key} (no existe en master)`);
      }
    });
  });

  if (hasErrors) {
    console.error('\n❌ Se encontraron errores en las traducciones.');
    process.exit(1);
  } else {
    console.log('\n✅ Todas las claves están completas.');
    process.exit(0);
  }
}

check();
