import { Router } from "express";
import RotaController from "../controllers/RotaController";

const rotasRota = Router();

// Listar todas as rotas (útil para os menus de Tarde/Madrugada)
rotasRota.get('/rotas', 
    (RotaController.listarRotas)
);

// Rota para listar rotas por turno: 
rotasRota.get('/rotas/turno/:tipo', 
    (RotaController.listarPorTurno)
);

// Mostrar detalhes de uma rota
rotasRota.get('/rota/:id', 
    (RotaController.mostrarUmaRota)
);

// Cadastrar nova rota (endpoint que o componente do App chama)
rotasRota.post('/rota', 
    (RotaController.cadastrarRota)
);

// Editar dados ou ordem dos passageiros da rota
rotasRota.put('/rota/:id', 
    (RotaController.editarRota)
);

// Excluir rota e liberar passageiros
rotasRota.delete('/rota/:id', 
    (RotaController.deletarRota)
);

export default rotasRota;
