import { AppDataSource } from "../data-source";
import { Cidade } from "../models/Cidade";
import { Estado } from "../models/Estado";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import ICidade from "../interfaces/ICidade";
import IEstado from "../interfaces/IEstado";
import EstadoService from "./EstadoService"; 
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";

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

        // 1. Resolve o Estado chamando o EstadoService (Garante ID e evita duplicação)
        const estadoFinal = await EstadoService.cadastrarEstado(dados.estado as IEstado);

        // 2. BUSCA PREVENTIVA: Tenta encontrar a Cidade exata antes de qualquer ação
        // Isso impede que o 'VerificarDuplicidade' trave o fluxo de cascata do Passageiro
        const cidadeExistente = await this.cidadeRepositorio.findOne({
            where: { 
                nome: dados.nome, 
                estado: { id: estadoFinal.id } 
            }
        });

        // Se o registro já existe, retornamos ele com o ID original (evita duplicação)
        if (cidadeExistente) {
            return cidadeExistente;
        }

        // 3. VALIDAÇÃO DE INTEGRIDADE: Se for nova, garantimos que não há conflitos
        await VerificarDuplicidade<Cidade>({
            repositorio: this.cidadeRepositorio,
            dados: { 
                nome: dados.nome, 
                estado: { id: estadoFinal.id } as Estado, 
            },
        });

        // 4. CRIAÇÃO: Registra a nova Cidade vinculada ao ID do Estado correto
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

        if (!cidadeAtual) {
            throw new NaoEncontradoErro('Cidade não encontrada para a edição!');
        }

        let estadoFinal = cidadeAtual.estado;

        // Se o estado foi enviado na edição, resolvemos o ID dele primeiro
        if (dados.estado) {
            estadoFinal = await EstadoService.cadastrarEstado(dados.estado as IEstado);
        }

        // VALIDAÇÃO DE EDIÇÃO SEGURA: 
        // Passamos o 'idParaIgnorar' (ID da própria Cidade) para que a 
        // verificação não barre a atualização do próprio registro.
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