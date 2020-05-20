import chai from "chai";
import chaiHttp from "chai-http";
import sinon from "sinon";
import { app } from "./index";
const should = chai.should();

chai.use(chaiHttp);

describe("API Testing", () => {
    it("create book", (done) => {
        chai.request(app)
            .post("/")
            .set("content-type", "application/json")
            .send({
                "jsonrpc": "2.0",
                "method": "createBook",
                "params": [{
                    "name": "coinswitch_cash",
                    "metadata": {}
                }],
                "id": 1
            })
            .end((err, res: any) => {
                res.should.have.status(200);
                res.body.should.be.a('object');
                res.body.should.have.property("result");
                sinon.assert.match(res.body.result, sinon.match({
                    "name": "coinswitch_cash",
                    "metadata": {},
                    "id": "3",
                    "createdAt": sinon.match.any
                  }));
                done();
            })
    })
})