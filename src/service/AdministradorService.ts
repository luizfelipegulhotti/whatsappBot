import { AppDataSource } from "../data-source";
import { Administrador } from "../models/Administrador";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import RequisicaoInvalidaErro from "../error/RequisicaoInvalida.400";
import IAdministrador from "../interfaces/IAdministrador";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import CpfValido from "../utils/validators/ValidacaoDeCpf";
import TextoHelper from "../utils/helpers/TextoHelper";

class AdministradorService {
    private static administradorRepositorio = AppDataSource.getRepository(Administrador);

    // Tradutor Universal baseado no LID: Localiza o administrador de forma explícita
    // recebendo tanto o ID sequencial numérico quanto o JID/LID textual do WhatsApp.    
    static async resolverAdministrador(parametro: string | number): Promise<Administrador> {
        const stringParam = String(parametro);

        if (stringParam.includes('@') || isNaN(Number(stringParam))) {
            const jidLimpo = stringParam.replace(/:[0-9]+/, '');
            const administrador = await this.buscarPorLid(jidLimpo);
            if (!administrador) {
                throw new NaoEncontradoErro("Administrador não localizado pelo identificador whatsappLid!");
            }
            return administrador;
        }

        return await this.mostrarUmAdministrador(Number(parametro));
    }

    // Service para listar todos os administradores:
    static async listarAdministradores(): Promise<Administrador[]> {
        return await this.administradorRepositorio.find({
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsApp: true,
                whatsappLid: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            }
        });
    }

    // Service para mostrar apenas um administrador (por ID):
    static async mostrarUmAdministrador(id: number): Promise<Administrador> {
        const administrador = await this.administradorRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsApp: true,
                whatsappLid: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            }
        });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado!');
        }

        return administrador;
    }

    // Service para buscar administrador por @lid:
    static async buscarPorLid(whatsappLid: string): Promise<Administrador | null> {
        const jidLimpo = whatsappLid.replace(/:[0-9]+/, '');
        return await this.administradorRepositorio.findOne({
            where: { whatsappLid: jidLimpo }
        });
    }

    /**
     * ATUALIZADOR AUTOMÁTICO DE LID: Chamado pelo controlador/bot assim que intercepta o 
     * acoplamento de rede entre o telefone real e o código do LID.
     */
    static async vincularLidAoTelefone(telefoneWhatsApp: string, whatsappLid: string): Promise<void> {
        const foneLimpo = telefoneWhatsApp.replace(/\D/g, '');
        const jidLimpo = whatsappLid.replace(/:[0-9]+/, '');

        const administrador = await this.administradorRepositorio.findOne({
            where: { telefoneWhatsApp: foneLimpo }
        });

        if (administrador && administrador.whatsappLid !== jidLimpo) {
            administrador.whatsappLid = jidLimpo;
            await this.administradorRepositorio.save(administrador);
            console.log(`[SISTEMA CONTRA FALHAS] 🏅 LID ${jidLimpo} vinculado ao administrador: ${administrador.nome}`);
        }
    }

    // Service para cadastrar um administrador:
    static async cadastrarAdministrador(dados: IAdministrador): Promise<Administrador> {
        validarCamposObrigatorios<Administrador>(dados as Administrador, 
            ['nome', 'cpf', 'email', 'senha', 'telefoneWhatsApp']
        );

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if(!CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('CPF inválido!')
        };

        await VerificarDuplicidade<IAdministrador>({
            repositorio: this.administradorRepositorio,
            dados: { cpf: dados.cpf, email: dados.email, telefoneWhatsApp: dados.telefoneWhatsApp }
        });

        const novoAdministrador = await this.administradorRepositorio.save(
            this.administradorRepositorio.create(dados)
        );

        const {senha, ...resultado} = novoAdministrador;

        return resultado as Administrador;
    }

    // Service para editar um administrador:
    static async editarAdministrador(id: number, dados: Partial<IAdministrador>): Promise<Administrador> {
        const administrador = await this.administradorRepositorio.findOne({ where: { id } });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado para edição!');
        }

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (dados.cpf && !CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('O novo CPF é inválido');
        }

        if (dados.cpf || dados.email || dados.telefoneWhatsApp) {
            await VerificarDuplicidade<IAdministrador>({
                repositorio: this.administradorRepositorio,
                dados: { 
                    cpf: dados.cpf ?? administrador.cpf, 
                    email: dados.email ?? administrador.email,
                    telefoneWhatsApp: dados.telefoneWhatsApp ?? administrador.telefoneWhatsApp 
                },
                idParaIgnorar: id
            });
        };

        this.administradorRepositorio.merge(administrador, dados as Administrador);
        const administradorAtualizado = await this.administradorRepositorio.save(administrador);

        const { senha, ...resultado } = administradorAtualizado;
        return resultado as Administrador;
    }

    // Service para deletar um administrador:
    static async deletarAdministrador(id: number): Promise<void> {
        const administrador = await this.administradorRepositorio.findOneBy({ id });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado para a exclusão!');
        }

        await this.administradorRepositorio.remove(administrador);
    }
}

export default AdministradorService;