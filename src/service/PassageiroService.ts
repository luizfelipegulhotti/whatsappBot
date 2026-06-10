import { AppDataSource } from "../data-source";
import { IsNull } from "typeorm";
import { Passageiro } from "../models/Passageiro";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IPassageiro from "../interfaces/IPassageiro";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import EnderecoService from "./EndereçoService";
import TextoHelper from "../utils/helpers/TextoHelper";

class PassageiroService {
    private static passageiroRepositorio = AppDataSource.getRepository(Passageiro);

    // Service para listar passageiros
    static async listarPassageiros(): Promise<Passageiro[]> {
        return await this.passageiroRepositorio.find({
            select: { 
                id: true, nome: true, telefoneWhatsApp: true, ativo: true, 
                empresa: { id: true, nome: true, logo: true }, 
                dataDeRegistro: true, dataDeEdicao: true 
            },
            relations: ["empresa", "endereco", "endereco.bairro", "endereco.bairro.cidade", "endereco.bairro.cidade.estado", "endereco.bairro.cidade.estado.pais"],
        });
    };

    // Service para mostrar um passageiro (por ID):
    static async mostrarUmPassageiro(id: number): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({
            where: { id },
            relations: ["empresa", "endereco", "endereco.bairro", "endereco.bairro.cidade", "endereco.bairro.cidade.estado", "endereco.bairro.cidade.estado.pais"],
        });
        if (!passageiro) throw new NaoEncontradoErro('Passageiro não identificado!');
        return passageiro;
    };

    // Service para listar passageiros vinculados à uma empresa e disponíveis:
    static async listarDisponiveisPorEmpresa(empresaId: number): Promise<Passageiro[]> {
        return await this.passageiroRepositorio.find({
            where: {
                empresa: { id: empresaId },
                rota: IsNull(), // Filtra quem não tem rotaId preenchido
                ativo: true
            },
            relations: ["endereco", "endereco.bairro"],
            select: {
                id: true,
                nome: true,
                endereco: {
                    id: true,
                    nome: true,
                    numero: true
                }
            }
        });
    }

    // Buscar passageiros segundo seus números de telefone:
    static async buscarPorTelefone(telefoneWhatsApp: string): Promise<Passageiro | null> {
        return await this.passageiroRepositorio.findOne({ where: { telefoneWhatsApp } });
    };

    // Service para cadastrar passageiros:
    static async cadastrarPassageiro(dados: IPassageiro): Promise<Passageiro> {
        validarCamposObrigatorios<Passageiro>(dados as Passageiro, ['nome', 'endereco', 'empresa']);
        await VerificarDuplicidade<Passageiro>({ repositorio: this.passageiroRepositorio, dados: { telefoneWhatsApp: dados.telefoneWhatsApp } });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        // DELEGAÇÃO: O EnderecoService resolve Bairro/Cidade/Estado e retorna o Endereço com ID
        // Isso garante que o bairroId não chegue como DEFAULT no banco
        const enderecoComId = await EnderecoService.cadastrarEndereco(dados.endereco);
        dados.endereco = enderecoComId;

        const novoPassageiro = this.passageiroRepositorio.create(dados);

        return await this.passageiroRepositorio.save(novoPassageiro);
    };

    // Service para editar passageiro:
    static async editarPassageiro(id: number, dados: Partial<IPassageiro>): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({ 
            where: { id }, 
            relations: ["endereco"] 
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!passageiro) throw new NaoEncontradoErro('Passageiro não encontrado!');

        if (dados.telefoneWhatsApp) {
            await VerificarDuplicidade<Passageiro>({ 
                repositorio: this.passageiroRepositorio, 
                dados: { telefoneWhatsApp: dados.telefoneWhatsApp }, 
                idParaIgnorar: id 
            });
        }

        if (dados.endereco && (dados.endereco.nome || dados.endereco.numero)) {
            dados.endereco = await EnderecoService.cadastrarEndereco(dados.endereco);
        }

        if (dados.ativo !== undefined) {
            passageiro.ativo = dados.ativo;
        }

        this.passageiroRepositorio.merge(passageiro, dados as Passageiro);
        
        return await this.passageiroRepositorio.save(passageiro);
    };

    // Service para deletar passageiro:
    static async deletarPassageiro(id: number): Promise<void> {
        const passageiro = await this.passageiroRepositorio.findOneBy({ id });
        if (!passageiro) throw new NaoEncontradoErro('Passageiro não encontrado!');
        await this.passageiroRepositorio.remove(passageiro);
    };
};

export default PassageiroService;