import { AppDataSource } from "../data-source";
import { Bairro } from "../models/Bairro";
import { Endereco } from "../models/Endereco";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IEndereco from "../interfaces/IEndereco";
import IBairro from "../interfaces/IBairro";
import BairroService from "./BairroService";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import TextoHelper from "../utils/helpers/TextoHelper";

class EnderecoService {
    private static enderecoRepositorio = AppDataSource.getRepository(Endereco);

    // Service para listar enderecos:
    static async listarEnderecos(): Promise<Endereco[]> {
        const enderecos = await this.enderecoRepositorio.find({
            select: { id: true, nome: true, numero: true, bairro: { id: true, nome: true } },
            relations: [ 'bairro' ],
        });
        return enderecos;
    };

    // Service para mostrar um endereco (por ID):
    static async mostrarUmEndereco(id: number): Promise<Endereco> {
        const endereco = await this.enderecoRepositorio.findOne({
            where: {id},
            select: { id: true, nome: true, numero: true, bairro: { id: true, nome: true } },
            relations: [ 'bairro' ],
        });
        if(!endereco) {
            throw new NaoEncontradoErro('Endereco não encontrado no sistema');
        };
        return endereco;
    };

    // Service para cadastrar endereco:
    static async cadastrarEndereco(dados: IEndereco): Promise<Endereco> {
        validarCamposObrigatorios<Endereco>(dados as Endereco, ['nome', 'numero'] );

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        const bairroFinal = await BairroService.cadastrarBairro(dados.bairro as IBairro);

        const enderecoExistente = await this.enderecoRepositorio.findOne({
            where: {
                nome: dados.nome,
                numero: dados.numero,
                bairro: { id: (bairroFinal as Bairro).id }
            }
        });

        if (enderecoExistente) {
            return enderecoExistente;
        }

        await VerificarDuplicidade<Endereco>({
            repositorio: this.enderecoRepositorio,
            dados: { 
                nome: dados.nome, 
                numero: dados.numero, 
                bairro: { id: (bairroFinal as Bairro).id } as Bairro, 
            },
        });

        let novoEndereco = this.enderecoRepositorio.create({ 
            ...dados, 
            bairro: bairroFinal as Bairro 
        });

        return await this.enderecoRepositorio.save(novoEndereco);
    };

    // Service para editar endereco:
    static async editarEndereco(id: number, dados: Partial<IEndereco>): Promise<Endereco> {
        const enderecoEditado = await this.enderecoRepositorio.findOne({ 
            where: { id }, 
            relations: ['bairro'] 
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if(!enderecoEditado) {
            throw new NaoEncontradoErro('Endereço não encontrado para a edição!')
        };

        let bairroFinal = enderecoEditado.bairro;

        if(dados.bairro) {
            bairroFinal = await BairroService.cadastrarBairro(dados.bairro as IBairro) as Bairro;
        };

        if(dados.nome || dados.numero || dados.bairro) {
            await VerificarDuplicidade<Endereco>({
                repositorio: this.enderecoRepositorio,
                dados: {
                    nome: dados.nome ?? enderecoEditado.nome,
                    numero: dados.numero ?? enderecoEditado.numero,
                    bairro: { id: bairroFinal?.id } as Bairro
                },
                idParaIgnorar: id,
            });
        };

        this.enderecoRepositorio.merge(enderecoEditado, dados, { bairro: bairroFinal });
        return await this.enderecoRepositorio.save(enderecoEditado);
    };

    // Service para excluir endereço:
    static async deletarEndereco(id: number): Promise<Endereco> {
        const endereco = await this.enderecoRepositorio.findOneBy({ id });
        if (!endereco) {
            throw new NaoEncontradoErro('Endereço não encontrado para exclusão');
        }
        await this.enderecoRepositorio.remove(endereco);
        return endereco;
    };
};

export default EnderecoService;