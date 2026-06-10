import { AppDataSource } from "../data-source";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IPais from "../interfaces/IPais";
import { Pais } from "../models/Pais";
import TextoHelper from "../utils/helpers/TextoHelper";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";

class PaisService {
    private static paisRepositorio = AppDataSource.getRepository(Pais);

    // Rota para listar países:
    static async listarPaises(): Promise<Pais[]> {
        const paises = await this.paisRepositorio.find({
            select: { id: true, nome: true },
        });
        return paises;
    };

    // Rota para mostrar um país (por ID):
    static async mostrarUmPais(id: number): Promise<Pais> {
        const pais = await this.paisRepositorio.findOne({
            where: { id },
            select: { id: true, nome: true },
        });
        if (!pais) {
            throw new NaoEncontradoErro('Pais não econtrado no sistema!');
        };
        return pais;
    };

    // Rota para cadastrar um país:
    static async cadastrarPais(dados: IPais): Promise<Pais> {
        validarCamposObrigatorios<Pais>(dados as Pais, ['nome']);

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        // 1. Lógica para evitar duplicação: busca pelo nome antes de criar
        const paisExistente = await this.paisRepositorio.findOneBy({ 
            nome: dados.nome 
        });

        if (paisExistente) {
            return paisExistente; // Se já existe, retorna o que tem o ID
        }

        // 2. Se não existir, valida duplicidade (opcional, já que o findOneBy resolve)
        // e procede com o salvamento
        const novoPais = this.paisRepositorio.create(dados);
        return await this.paisRepositorio.save(novoPais);
    };

    // Rota para editar um país:
    static async editarPais(id: number, dados: Partial<IPais>): Promise<Pais> {
        const paisAtualizado = await this.paisRepositorio.findOneBy({ id });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!paisAtualizado) {
            throw new NaoEncontradoErro('Pais não encontrado para a edição');
        };

        if (dados.nome) {
            await VerificarDuplicidade<Pais>({
                repositorio: this.paisRepositorio,
                dados: { nome: dados.nome },
                idParaIgnorar: id
            });
        };

        this.paisRepositorio.merge(paisAtualizado, dados);
        return await this.paisRepositorio.save(paisAtualizado);
    };

    // Rota para deletar um país:
    static async deletarPais(id: number): Promise<Pais> {
        const paisDeletado = await this.paisRepositorio.findOneBy({ id });
        if (!paisDeletado) {
            throw new NaoEncontradoErro('País não encntrado para a exclusão!');
        };
        await this.paisRepositorio.remove(paisDeletado);
        return paisDeletado;
    };
};

export default PaisService;