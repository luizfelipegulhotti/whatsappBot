import { Router } from "express";
import EstadoController from "../controllers/EstadoController";

const rotasEstado = Router();

// Rota para listar estados:
rotasEstado.get('/estados', 
    (EstadoController.listarEstados)
);

// Rota para mostrar um estado (por ID):
rotasEstado.get('/estado/:id', 
    (EstadoController.mostrarUmEstado)
);

// Rota para cadastrar estado:
rotasEstado.post('/estado', 
    (EstadoController.cadastrarEstado)
);

// Rota para editar estado:
rotasEstado.put('/estado/:id', 
    (EstadoController.editarEstado)
);

// Rota para excluir estado:
rotasEstado.delete('/estado/:id', 
    (EstadoController.deletarEstado)
);

export default rotasEstado;
