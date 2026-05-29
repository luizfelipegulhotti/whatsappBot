import { Column, Entity, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";
import { Passageiro } from "./Passageiro";

@Entity('empresa')
export class Empresa {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column({ unique: true })
    cnpj!: string;

    @Column({ nullable: true })
    logo?: string;

    // Refatorado: agora a empresa pode pertencer a várias rotas simultaneamente
    @ManyToMany(() => Rota, rota => rota.empresas)
    rotas?: Rota[];

    @OneToMany(() => Passageiro, passageiro => passageiro.empresa)
    passageiros?: Passageiro[];
}