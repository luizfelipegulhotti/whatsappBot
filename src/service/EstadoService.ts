import { AppDataSource } from "../data-source";
import { Estado } from "../models/Estado";
import { Pais } from "../models/Pais";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IEstado from "../interfaces/IEstado";
import IPais from "../interfaces/IPais";
import PaisService from "./PaisService";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";

class EstadoService {
    private static estadoRepositorio = AppDataSource.getRepository(Estado);

    // Service para listar estados:
    static async listarEstados(): Promise<Estado[]> {
        const estados = await this.estadoRepositorio.find({
            select: { 
                id: true, 
                nome: true, 
                pais: { id: true, nome: true }, 
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

        // 1. Resolve o País chamando o PaisService (Garante ID e evita duplicação no topo)
        const paisFinal = await PaisService.cadastrarPais(dados.pais as IPais);

        // 2. BUSCA PREVENTIVA: Tenta encontrar o Estado exato antes de qualquer ação
        const estadoExistente = await this.estadoRepositorio.findOne({
            where: { 
                nome: dados.nome, 
                pais: { id: paisFinal.id } 
            }
        });

        // Se o registro já existe, retornamos ele com o ID original (evita duplicação)
        if (estadoExistente) {
            return estadoExistente;
        }

        // 3. VALIDAÇÃO DE INTEGRIDADE: Se for novo, garantimos que não há conflitos
        await VerificarDuplicidade<Estado>({
            repositorio: this.estadoRepositorio,
            dados: { 
                nome: dados.nome, 
                pais: { id: paisFinal.id } as Pais 
            },
        });

        // 4. CRIAÇÃO: Registra o novo Estado vinculado ao ID do País correto
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

        if (!estadoAtual) {
            throw new NaoEncontradoErro('Estado não encontrado para a edição!');
        }

        let paisFinal = estadoAtual.pais;

        // Se o país foi enviado na edição, resolvemos o ID dele primeiro
        if (dados.pais) {
            paisFinal = await PaisService.cadastrarPais(dados.pais as IPais);
        };

        // VALIDAÇÃO DE EDIÇÃO SEGURA: 
        // Passamos o 'idParaIgnorar' (ID do próprio Estado) para que a 
        // verificação não barre a atualização do próprio registro.
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