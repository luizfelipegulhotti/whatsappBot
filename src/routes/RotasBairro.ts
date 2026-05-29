import { Router } from "express";
import BairroController from "../controllers/BairroController";

const rotasBairro = Router();

// Rota para listar todos os bairros:
rotasBairro.get('/bairros', 
    (BairroController.listarBairros)
);

// Rota para mostrar um bairro (por ID):
rotasBairro.get('/bairro/:id', 
    (BairroController.mostrarUmBairro)
);

// Rota para cadastrar bairro:
rotasBairro.post('/bairro', 
    (BairroController.cadastrarBairro)
);

// Rota para editar um bairro:
rotasBairro.put('/bairro/:id', 
    (BairroController.editarBairro)
);

// Rota para excluir bairro:
rotasBairro.delete('/delete/:id', 
    (BairroController.deletarBairro)
);

export default rotasBairro;