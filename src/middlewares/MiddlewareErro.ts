import { NextFunction, Request, Response } from "express";
import ApiErro from "../error/ApiErro";

const MiddlewareErro = (
  erro: Error & Partial<ApiErro>,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[Erro]: ${erro.message}`);

  const status = erro instanceof ApiErro ? erro.statusDeCodigo : 500;
  
  // Aqui está o segredo: transforme a string em um objeto JSON
  const mensagem = erro instanceof ApiErro ? erro.message : "Erro interno no servidor";

  // Retorne um objeto { message: "..." }
  return res.status(status).json({ message: mensagem }); 
};
export default MiddlewareErro;