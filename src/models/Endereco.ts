import { Column, Entity, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Bairro } from "./Bairro";
import { Passageiro } from "./Passageiro";

@Entity('endereco')
export class Endereco{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string

    @Column()
    numero!: number;

    @Column()
    bairroId?: number

    @ManyToOne(() => Bairro, bairro => bairro.enderecos, { 
        eager: true, 
        cascade: true 
    })
    @JoinColumn({name: 'bairroId'})
    bairro?: Bairro;

    @ManyToMany(() => Passageiro, passageiro => passageiro.endereco)
    passageiro?: Passageiro[];
}