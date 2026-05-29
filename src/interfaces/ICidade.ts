import IEstado from "./IEstado";

interface ICidade {
    id?: number;
    nome: string;
    estado?: IEstado;
};

export default ICidade;