import { Router } from "express";
import PaisController from "../controllers/PaisController";

const rotasPais = Router();

// Rota para listar países:
rotasPais.get('/paises', 
    (PaisController.listarPaises)
);

// Rota para mostrar um país(por ID)
rotasPais.get('/pais/:id', 
    (PaisController.mostrarUmPais)
);

// Rota para cadastrar país:
rotasPais.post('/pais', 
    (PaisController.cadastarPais)
);

// Rota para editar país:
rotasPais.put('/pais/:id', 
    (PaisController.editarPais)
);

// Rota para excluír país:
rotasPais.delete('/pais/:id', 
    (PaisController.deletarPais)
);

export default rotasPais;