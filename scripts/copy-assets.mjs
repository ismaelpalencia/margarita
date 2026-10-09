import fs from "fs";
import path from "path";

const rootDir = process.cwd();

const copies = [
    {
        from: path.join(rootDir, "src", "views"),
        to: path.join(rootDir, "dist", "views")
    },
    {
        from: path.join(rootDir, "src", "public"),
        to: path.join(rootDir, "dist", "public")
    }
];

for (const item of copies) {
    if (!fs.existsSync(item.from)) {
        console.warn(`No existe: ${item.from}`);
        continue;
    }

    fs.rmSync(item.to, {
        recursive: true,
        force: true
    });

    fs.cpSync(item.from, item.to, {
        recursive: true
    });

    console.log(`Copiado: ${item.from} -> ${item.to}`);
}