import { Request, Response } from "express";
import MotoristaService from "../service/MotoristaService";

class MotoristaController {

    // Service para listar todos os motoristas:
    static async listarMotoristas(req: Request, res: Response): Promise<Response> {
        const motoristas = await MotoristaService.listarMotoristas();
        return res.status(200).json(motoristas);
    }

    // Service para listar um motorista (por ID)
    static async mostrarUmMotorista(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const motorista = await MotoristaService.mostrarUmMotorista(Number(id));
        return res.status(200).json(motorista);
    }

    // Service para cadastrar motoristas: 
    static async cadastrarMotorista(req: Request, res: Response): Promise<Response> {
        const novoMotorista = await MotoristaService.cadastrarMotorista(req.body);
        return res.status(201).json({
            message: 'Motorista cadastrado com sucesso!',
            novoMotorista
        });
    }

    // Service para editar o motorista (por ID):
    static async editarMotorista(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const motoristaEditado = await MotoristaService.editarMotorista(Number(id), req.body);
        return res.status(200).json({
            message: 'Motorista editado com sucesso!',
            motoristaEditado
        });
    }
    // Service para alterar o status do motorista:
    static async alterarStatus(req: Request, res: Response): Promise<Response> {
        const { id } = req.params; 
        const { ativo } = req.body;
        
        // Determina se o parâmetro recebido na URL é um LID textual ou o ID do banco
        const identificadorValido: string | number = String(id).includes('@') || isNaN(Number(id)) 
            ? String(id) 
            : Number(id);
        
        // Resolve a entidade independente de como ela foi buscada na API externa
        const motorista = await MotoristaService.resolverMotorista(identificadorValido);
        
        // CORRIGIDO: Passando o whatsAppLid em vez do telefoneWhatsApp para alinhar com o Service baseado em LID
        await MotoristaService.alterarStatusAtivo(motorista.whatsAppLid!, ativo);
        
        return res.status(200).json({
            message: `Motorista ${motorista.nome} ${ativo ? 'ativado' : 'inativado'} com sucesso!` 
        });
    }

    // Service para excluir o motorista:
    static async deletarMotorista(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        await MotoristaService.deletarMotorista(Number(id));
        return res.status(200).json({
            message: 'Motorista excluído com sucesso!',
        });
    }
}

export default MotoristaController;