import fs from 'fs';
import path from 'path';

const [name, targetDir] = process.argv.slice(2);

if (!name || !targetDir) {
  console.error('Usage: node generate-mvvm.mjs <Name> <target/path>');
  console.error('Generates <Name>.tsx (view), <Name>ViewModel.tsx (hook), i<Name>.tsx (types) in <target/path>.');
  process.exit(1);
}

const templatesDir = path.join(process.cwd(), 'tools/templates/mvvm');
const resolvedTargetDir = path.join(process.cwd(), targetDir);

if (!fs.existsSync(resolvedTargetDir)) {
  fs.mkdirSync(resolvedTargetDir, { recursive: true });
}

const files = fs.readdirSync(templatesDir);

files.forEach((file) => {
  const templatePath = path.join(templatesDir, file);
  let content = fs.readFileSync(templatePath, 'utf8');
  
  // Replace placeholders
  content = content.replace(/{{name}}/g, name);
  
  // Generate filename
  const fileName = file.replace(/__name__/g, name).replace('.template', '');
  const outPath = path.join(resolvedTargetDir, fileName);
  
  fs.writeFileSync(outPath, content);
  console.log(`Generated: ${outPath}`);
});
