import { Router } from 'express';
import EmpresaController from '../controllers/EmpresaController';
import { realizarUpload } from '../middlewares/MiddlewareMulter';

const rotasEmpresa = Router();

// Rota para listar todas as empresas:
rotasEmpresa.get('/empresas', realizarUpload.single('logo'),
    EmpresaController.listarEmpresas
);

// Rota para mostrar uma empresa (por ID):
rotasEmpresa.get('/empresa/:id', 
    EmpresaController.mostrarUmaEmpresa
);

// Rota para mostrar uma empresa com todos os atributos:
rotasEmpresa.get('/empresa/completa/:id', 
    EmpresaController.mostrarEmpresaIndividualCompleta
);

// Rota para mostrar uma empresa com a logo, sem funcionários:
rotasEmpresa.get('/empresa/logo/:id', 
    EmpresaController.mostrarEmpresaComALogo
);

// Rota para mostrar a empresa com funcionários, sem a logo:
rotasEmpresa.get('/empresa/funcionarios/:id', 
    EmpresaController.mostrarEmpresaComFuncionarios
);

// Rota para cadastrar empresa:
rotasEmpresa.post('/empresa', realizarUpload.single('logo'),
    EmpresaController.cadastrarEmpresa
);

// Rota para editar empresa:
rotasEmpresa.put('/empresa/:id', realizarUpload.single('logo'),
    EmpresaController.editarEmpresa
);

// Rota para excluir a empresa do sistema:
rotasEmpresa.delete('/empresa/:id', 
    EmpresaController.deletarEmpresa
);

export default rotasEmpresa;
