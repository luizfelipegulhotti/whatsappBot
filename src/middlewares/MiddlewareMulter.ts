import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Define o caminho da pasta de uploads
const uploadFolder = path.resolve(__dirname, '..', 'public', 'imagem_uso');

// Garante que a pasta existe ao iniciar o sistema
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadFolder);
    },
    filename: (req, file, cb) => {
        // Gera: 20240508153045 (AnoMesDiaHoraMinutoSegundo)
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const ext = path.extname(file.originalname);
        
        // Exemplo: logo_20240508153045.png
        cb(null, `${file.fieldname}_${timestamp}${ext}`);
    }
});

export const realizarUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // Limite de 5MB
    },
    fileFilter: (req, file, cb) => {
        const tiposPermitidos = /jpeg|jpg|png|webp/;
        const extensaoValida = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
        const mimeValido = tiposPermitidos.test(file.mimetype);

        if (extensaoValida && mimeValido) {
            return cb(null, true);
        }
        cb(new Error("Apenas imagens (JPG, PNG, WEBP) são permitidas!"));
    }
});
