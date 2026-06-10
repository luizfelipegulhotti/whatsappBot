import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import * as bcrypt from 'bcrypt';

@Entity('administrador')
export class Administrador {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column({ unique: true })
    cpf!: string;

    @Column({ unique: true, nullable: true })
    telefoneWhatsApp!: string;

    @Column({ unique: true, nullable: true })
    whatsappLid?: string;

    @Column({ unique: true })
    email!: string;

    @Column({ select: false })
    senha!: string;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataDeRegistro!: Date;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP" })
    dataDeEdicao!: Date;

    @BeforeInsert()
    async hashSenhaInsert() {
        this.senha = await bcrypt.hash(this.senha, 10);
    }
    
    @BeforeUpdate()
    async hashSenhaUpdate() {
    if (this.senha && !this.senha.startsWith('$2b$')) { 
        this.senha = await bcrypt.hash(this.senha, 10);
        }
    }

}