import { NextFunction, Request, Response } from "express";
import { botInstance } from "../index";

// Middleware para garantir que o bot está inicializado antes de qualquer comando
const verificarBot = (req: Request, res: Response, next: NextFunction) => {
    if (!botInstance) {
        return res.status(503).json({ error: "O serviço de WhatsApp está offline ou inicializando." });
    }
    next();
};

export default verificarBot;