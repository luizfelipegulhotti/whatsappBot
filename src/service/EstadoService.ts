import { AppDataSource } from "../data-source";
import { Estado } from "../models/Estado";
import { Pais } from "../models/Pais";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IEstado from "../interfaces/IEstado";
import IPais from "../interfaces/IPais";
import PaisService from "./PaisService";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import TextoHelper from "../utils/helpers/TextoHelper";

class EstadoService {
    private static estadoRepositorio = AppDataSource.getRepository(Estado);

    // Service para listar estados:
    static async listarEstados(): Promise<Estado[]> {
        const estados = await this.estadoRepositorio.find({
            select: {
                id: true,
                nome: true,
                pais: { id: true,
                        nome: true
                    },
            },
            relations: ['pais'],
        });
        return estados;
    };

    // Service para mostrar um estado (por ID):
    static async mostrarUmEstado(id: number): Promise<Estado> {
        const estado = await this.estadoRepositorio.findOne({
            where: { id },
            select: { 
                id: true, 
                nome: true, 
                pais: { id: true, nome: true }, 
            },
            relations: ['pais'],
        });
        if (!estado) {
            throw new NaoEncontradoErro('Estado não encontrado no sistema!');
        };
        return estado;
    };

    // Service para cadastrar um estado:
    static async cadastrarEstado(dados: IEstado): Promise<Estado> {
        validarCamposObrigatorios<Estado>(dados as Estado, ['nome']);

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        const paisFinal = await PaisService.cadastrarPais(dados.pais as IPais);

        const estadoExistente = await this.estadoRepositorio.findOne({
            where: { 
                nome: dados.nome, 
                pais: { id: paisFinal.id } 
            }
        });

        if (estadoExistente) {
            return estadoExistente;
        }

        await VerificarDuplicidade<Estado>({
            repositorio: this.estadoRepositorio,
            dados: { 
                nome: dados.nome, 
                pais: { id: paisFinal.id } as Pais 
            },
        });

        const novoEstado = this.estadoRepositorio.create({
            ...dados,
            pais: paisFinal,
        });

        return await this.estadoRepositorio.save(novoEstado);
    };

    // Service para editar estado:
    static async editarEstado(id: number, dados: Partial<IEstado>): Promise<Estado> {
        const estadoAtual = await this.estadoRepositorio.findOne({ 
            where: { id }, 
            relations: ['pais'] 
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!estadoAtual) {
            throw new NaoEncontradoErro('Estado não encontrado para a edição!');
        }

        let paisFinal = estadoAtual.pais;

        if (dados.pais) {
            paisFinal = await PaisService.cadastrarPais(dados.pais as IPais);
        };

        if (dados.nome || dados.pais) {
            await VerificarDuplicidade<Estado>({
                repositorio: this.estadoRepositorio,
                dados: {
                    nome: dados.nome ?? estadoAtual.nome,
                    pais: { id: paisFinal?.id } as Pais
                },
                idParaIgnorar: id, 
            });
        };

        this.estadoRepositorio.merge(estadoAtual, { ...dados, pais: paisFinal as Pais });
        return await this.estadoRepositorio.save(estadoAtual);
    };

    // Service para deletar Estado:
    static async deletarEstado(id: number): Promise<Estado> {
        const estadoDeletado = await this.estadoRepositorio.findOneBy({ id });
        if (!estadoDeletado) {
            throw new NaoEncontradoErro('Estado não encontrado para a exclusão!');
        };
        await this.estadoRepositorio.remove(estadoDeletado);
        return estadoDeletado;
    };
};

export default EstadoService;