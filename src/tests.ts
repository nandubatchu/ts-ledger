import { app } from "./index";
import * as chai from "chai";
import chaiHttp from "chai-http";
const should = chai.should();

chai.use(chaiHttp);

describe("API Testing", () => {
    it("accounts", (done) => {
        chai.request(app)
            .get("/account")
            .query({id: "1"})
            .end((err, res) => {
                res.should.have.status(200);
                res.body.should.be.a('object');
                res.body.should.have.property('success').eql(true);
                done();
            })
    })
})