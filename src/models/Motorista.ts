import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('motorista')
export class Motorista {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column( { unique: true, nullable: true })
    telefoneWhatsApp?: string;

    @Column( {unique: true, nullable: true})
    whatsAppLid?: string;

    @Column( { default: true })
    ativo!: boolean;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataDeRegistro!: Date;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP" })
    dataDeEdicao!: Date;
}