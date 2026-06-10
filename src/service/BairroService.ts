import { AppDataSource } from "../data-source";
import { Bairro } from "../models/Bairro";
import { Cidade } from "../models/Cidade";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IBairro from "../interfaces/IBairro";
import ICidade from "../interfaces/ICidade";
import CidadeService from "./CidadeService";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import TextoHelper from "../utils/helpers/TextoHelper";

class BairroService {
    private static bairroRepositorio = AppDataSource.getRepository(Bairro);

    // Service para listar todos os bairros:
    static async listarBairros(): Promise<Bairro[]> {
        const bairros = await this.bairroRepositorio.find({
            select: { id: true, nome: true, cidade: { id: true, nome: true } },
            relations: ['cidade'],
        });
        return bairros;
    };

    // Service para mostrar um bairro (por ID):
    static async mostrarUmBairro(id: number): Promise<Bairro> {
        const bairro = await this.bairroRepositorio.findOne({
            where: { id },
            select: { id: true, nome: true, cidade: { id: true, nome: true } },
            relations: ['cidade'],
        });
        if(!bairro) {
            throw new NaoEncontradoErro('Bairro não encontrado no sistema');
        };
        return bairro;
    };

    // Service para cadastrar bairro:
    static async cadastrarBairro(dados: IBairro): Promise<Bairro> {
        validarCamposObrigatorios<IBairro>(dados, ['nome']);

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        // 1. Resolvemos a Cidade via Service (Garante o ID e resolve Estado/Pais)
        const cidadeFinal = await CidadeService.cadastrarCidade(dados.cidade as ICidade);

        // 2. BUSCA PREVENTIVA: Tenta encontrar o Bairro exato antes de qualquer ação
        // Isso impede que o 'VerificarDuplicidade' barre o fluxo de cascata
        const bairroExistente = await this.bairroRepositorio.findOne({
            where: { 
                nome: dados.nome, 
                cidade: { id: cidadeFinal.id } 
            }
        });

        // Se o registro já existe, retornamos ele com o ID original (evita duplicação)
        if (bairroExistente) {
            return bairroExistente;
        }

        // 3. VALIDAÇÃO DE INTEGRIDADE: Se for novo, garantimos que não há conflitos
        await VerificarDuplicidade<Bairro>({
            repositorio: this.bairroRepositorio,
            dados: { 
                nome: dados.nome, 
                cidade: { id: cidadeFinal.id } as Cidade 
            },
        });

        // 4. CRIAÇÃO: Injetamos o objeto com ID para o TypeORM preencher a FK corretamente
        const novoBairro = this.bairroRepositorio.create({ 
            ...dados, 
            cidade: cidadeFinal 
        });

        return await this.bairroRepositorio.save(novoBairro);
    };

    // Service para editar bairro:
    static async editarBairro(id: number, dados: Partial<IBairro>): Promise<Bairro> {
        const bairroAtual = await this.bairroRepositorio.findOne({ 
            where: { id }, 
            relations: ['cidade', 'cidade.estado'] 
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!bairroAtual) {
            throw new NaoEncontradoErro('Bairro não encontrado para a edição!');
        }

        let cidadeFinal = bairroAtual.cidade;

        // Se houver alteração de cidade, usamos o CidadeService para pegar o ID correto
        if (dados.cidade) {
            cidadeFinal = await CidadeService.cadastrarCidade(dados.cidade as ICidade);
        }

        // VALIDAÇÃO DE EDIÇÃO SEGURA: 
        // Passamos o 'idParaIgnorar' (ID do próprio Bairro) para que a 
        // verificação não barre a atualização do próprio registro.
        if (dados.nome || dados.cidade) {
            await VerificarDuplicidade<Bairro>({
                repositorio: this.bairroRepositorio,
                dados: {
                    nome: dados.nome ?? bairroAtual.nome,
                    cidade: { id: cidadeFinal?.id } as Cidade
                },
                idParaIgnorar: id, 
            });
        }

        this.bairroRepositorio.merge(bairroAtual, { ...dados, cidade: cidadeFinal });
        return await this.bairroRepositorio.save(bairroAtual);
    };

    // Service para excluir bairro:
    static async deletarBairro(id: number): Promise<Bairro> {
        const bairroDeletado = await this.bairroRepositorio.findOneBy({ id });
        if(!bairroDeletado) {
            throw new NaoEncontradoErro('Bairro não encontrado para a exclusão!')
        };
        await this.bairroRepositorio.remove(bairroDeletado);
        return bairroDeletado;
    };
};

export default BairroService;