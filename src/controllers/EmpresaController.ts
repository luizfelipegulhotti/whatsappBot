import { Request, Response } from "express";
import EmpresaService from "../service/EmpresaService";

class EmpresaController {

    // Controller para listar empresas:
    static async listarEmpresas(req: Request, res: Response) {
        const empresas = await EmpresaService.listarEmpresas();
        return res.status(200).json(empresas);
    };

    // Controller para mostrar uma empresa (por ID, sem os funcionários):
    static async mostrarUmaEmpresa(req: Request, res: Response) {
        const { id } = req.params;
        const umaEmpresa = await EmpresaService.mostrarUmaEmpresa(Number(id));
        return res.status(200).json(umaEmpresa);
    };

    // Controller para mostrar uma empresa com todos os atributos (por ID):
    static async mostrarEmpresaIndividualCompleta(req: Request, res: Response) {
        const { id } = req.params;
        const umaEmpresaCompleta = await EmpresaService.mostrarEmpresaIndividualCompleta(Number(id));
        return res.status(200).json(umaEmpresaCompleta);
    };

    // Controller para mostrar uma empresa com a logo, sem funcionário (por ID):
    static async mostrarEmpresaComALogo(req: Request, res: Response) {
        const { id } = req.params;
        const empresaComALogo = await EmpresaService.mostrarEmpresaComALogo(Number(id));
        return res.status(200).json(empresaComALogo);
    };

    // Controller para mostrar uma empresa com todos os funcionários, sem logo (por ID):
    static async mostrarEmpresaComFuncionarios(req: Request, res: Response) {
        const { id } = req.params;
        const empresaComFuncionarios = await EmpresaService.mostrarEmpresaComFuncionarios(Number(id));
        return res.status(200).json(empresaComFuncionarios);
    };

    // Controller para cadastrar empresas:
    static async cadastrarEmpresa(req: Request, res: Response) {
        const dados = {
            ...req.body,
            logo: req.file ? req.file.filename : undefined
        };

        const novaEmpresa = await EmpresaService.cadastrarEmpresa(dados);
        return res.status(201).json({
            message: 'Empresa cadastrada com sucesso!',
            novaEmpresa
        });
    };

    // Controller para editar empresa:
    static async editarEmpresa(req: Request, res: Response) {
        const { id } = req.params;
        const dados = {            
            ...req.body,
            logo: req.file ? req.file.filename : undefined
        };

        const empresaAtualizada = await EmpresaService.editarEmpresa(Number(id), dados);
        return res.status(200).json({
            message: 'Empresa atualizada com sucesso',
            empresaAtualizada
        });
    };

    // Controller para excluir a empresa do sistema:
    static async deletarEmpresa(req: Request, res: Response) {
        const { id } = req.params;
        const empresaDeletada = await EmpresaService.deletarEmpresa(Number(id));
        return res.status(200).json({
            message: 'Empresa excluída do sistema com sucesso!',
            empresaDeletada
        });
    };
};

export default EmpresaController;