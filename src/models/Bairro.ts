import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Endereco } from "./Endereco";
import { Cidade } from "./Cidade";

@Entity('bairro')
export class Bairro{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @OneToMany(() => Endereco, endereco => endereco.bairro)
    enderecos?: Endereco[];

    @Column()
    cidadeId?: number;

    @ManyToOne(() => Cidade, cidade => cidade.bairros, { 
        eager: true, 
        cascade: true 
    })
    @JoinColumn({name: 'cidadeId'})
    cidade?: Cidade
}