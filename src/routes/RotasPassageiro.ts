import { Router } from "express";
import PassageiroController from "../controllers/PassageiroController";

const rotasPassageiro = Router();

// Rota pasa listar todos os passageiros:
rotasPassageiro.get('/passageiros',
    (PassageiroController.listarPassageiros)
);

// Rota para mostrar um passageiro (por ID):
rotasPassageiro.get('/passageiro/:id',
    (PassageiroController.mostrarUmPassageiro)
);

// Rota para captar um passageiro disponível
rotasPassageiro.get("/passageiros/disponiveis/:empresaId", 
    (PassageiroController.listarDisponiveis)
);
// Rota para cadastrar passageiros:
rotasPassageiro.post('/passageiro', 
    (PassageiroController.cadastrarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.put('/passageiro/:id',
    (PassageiroController.editarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.delete('/passageiro/:id',
    (PassageiroController.deletarPassageiro)
);

export default rotasPassageiro;