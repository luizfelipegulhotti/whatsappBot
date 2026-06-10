interface IAdministrador {
    id: number;
    nome: string,
    cpf: string,
    email: string,
    senha: string,
    telefoneWhatsApp: string,
    whatsappLid?: string;
}

export default IAdministrador;