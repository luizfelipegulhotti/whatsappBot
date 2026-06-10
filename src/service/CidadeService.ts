import { AppDataSource } from "../data-source";
import { Cidade } from "../models/Cidade";
import { Estado } from "../models/Estado";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import ICidade from "../interfaces/ICidade";
import IEstado from "../interfaces/IEstado";
import EstadoService from "./EstadoService"; 
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import TextoHelper from "../utils/helpers/TextoHelper";

class CidadeService {
    private static cidadeRepositorio = AppDataSource.getRepository(Cidade);

    // Service para listar todas as cidades:
    static async listarCidades(): Promise<Cidade[]> {
        const cidades = await this.cidadeRepositorio.find({
            select: { 
                id: true, 
                nome: true, 
                estado: { id: true, nome: true }, 
            },
            relations: ['estado'],
        });
        return cidades;
    };

    // Service para mostrar uma cidade (por ID):
    static async mostrarUmaCidade(id: number): Promise<Cidade> {
        const cidade = await this.cidadeRepositorio.findOne({
            where: { id },
            select: { 
                id: true, 
                nome: true, 
                estado: { id: true, nome: true }, 
            },
            relations: ['estado'],
        });
        if (!cidade) {
            throw new NaoEncontradoErro('Cidade não encontrada no sistema!');
        };
        return cidade;
    };

    // Service para cadastrar cidade:
    static async cadastrarCidade(dados: ICidade): Promise<Cidade> {
        validarCamposObrigatorios<Cidade>(dados as Cidade, ['nome']);

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        const estadoFinal = await EstadoService.cadastrarEstado(dados.estado as IEstado);

        const cidadeExistente = await this.cidadeRepositorio.findOne({
            where: { 
                nome: dados.nome, 
                estado: { id: estadoFinal.id } 
            }
        });

        if (cidadeExistente) {
            return cidadeExistente;
        }

        await VerificarDuplicidade<Cidade>({
            repositorio: this.cidadeRepositorio,
            dados: { 
                nome: dados.nome, 
                estado: { id: estadoFinal.id } as Estado, 
            },
        });

        const novaCidade = this.cidadeRepositorio.create({
            ...dados,
            estado: estadoFinal,
        });

        return await this.cidadeRepositorio.save(novaCidade);
    };

    // Service para editar cidade:
    static async editarCidade(id: number, dados: Partial<ICidade>): Promise<Cidade> {
        const cidadeAtual = await this.cidadeRepositorio.findOne({
            where: { id },
            relations: ['estado', 'estado.pais']
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!cidadeAtual) {
            throw new NaoEncontradoErro('Cidade não encontrada para a edição!');
        }

        let estadoFinal = cidadeAtual.estado;

        
        if (dados.estado) {
            estadoFinal = await EstadoService.cadastrarEstado(dados.estado as IEstado);
        }

        if (dados.nome || dados.estado) {
            await VerificarDuplicidade<Cidade>({
                repositorio: this.cidadeRepositorio,
                dados: {
                    nome: dados.nome ?? cidadeAtual.nome,
                    estado: { id: estadoFinal?.id } as Estado
                },
                idParaIgnorar: id, // ID da Cidade
            });
        }

        this.cidadeRepositorio.merge(cidadeAtual, { ...dados, estado: estadoFinal });
        return await this.cidadeRepositorio.save(cidadeAtual);
    }

    // Service para excluir cidade:
    static async deletarCidade(id: number): Promise<Cidade> {
        const cidadeDeletada = await this.cidadeRepositorio.findOneBy({ id });
        if (!cidadeDeletada) {
            throw new NaoEncontradoErro('Cidade não encontrada no sistema para a exclusão!');
        };
        await this.cidadeRepositorio.remove(cidadeDeletada);
        return cidadeDeletada;
    }
};

export default CidadeService;