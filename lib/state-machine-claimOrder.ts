import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import {Construct} from "constructs";
import {Stack} from "aws-cdk-lib";
import {IEventBus} from "aws-cdk-lib/aws-events";
import {ITable} from "aws-cdk-lib/aws-dynamodb";

export class StateMachineClaimMake  extends Construct {

    readonly claimOrder = new sfn.Pass(this, 'Claim Order');
    constructor(s: Stack, id: string, eventBus:IEventBus, orderTable:ITable) {
        super(s, id);


        const makeOrUnmake = new sfn.Choice(this, 'Make OR Unmake?');

        const unmakeOrder = new sfn.Pass(this, 'Unmake Order', {
            parameters: {
                baristaUserId: '',
                'orderId.$': '$.orderId',
                Message: "The barista has pressed the 'UnMake order' button, this Invokes a Lambda function via API Gateway, which updates the order in DynamoDB and emits a new 'make order' Event.",
            },
        });

        const dynamoDbUpdateOrder = new tasks.DynamoUpdateItem(this, 'DynamoDB Update Order', {
            table: orderTable,
            key: {
                PK: tasks.DynamoAttributeValue.fromString('orders'),
                SK: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.orderId'))
            },
            updateExpression: 'set #baristaUserId = :baristaUserId',
            expressionAttributeNames: {'#baristaUserId': 'baristaUserId'},
            expressionAttributeValues: {':baristaUserId': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.baristaUserId'))},
            resultSelector: {'Attributes.$': '$.Attributes'},
            resultPath: '$.result',
        });

        const constructRecord = new sfn.Pass(this, 'Construct record', {
            parameters: {
                'baristaUserId.$': '$.result.Attributes.baristaUserId.S',
                'orderId.$': '$.orderId',
                'userId.$': '$.result.Attributes.USERID.S',
                Message: "The barista has pressed the 'Make order' button, this Invokes a Lambda function via API Gateway, which updates the order in DynamoDB and emits a new 'make order' Event.",
            },
            resultPath: '$.detail',
        });

        const eventBridgeEmitMakingOrder = new tasks.EventBridgePutEvents(this, 'EventBridge Emit Making Order', {
            entries: [{
                detail: sfn.TaskInput.fromJsonPathAt('States.JsonToString($.detail)'),
                detailType: 'OrderManager.MakeOrder',
                eventBus,
                source: 'awsserverlessda.serverlesspresso',
            }],
        });

        this.claimOrder.next(makeOrUnmake);
        makeOrUnmake.when(sfn.Condition.stringEquals('$.action', 'unmake'), unmakeOrder)
            .otherwise(dynamoDbUpdateOrder);
        unmakeOrder.next(dynamoDbUpdateOrder);
        dynamoDbUpdateOrder.next(constructRecord);
        constructRecord.next(eventBridgeEmitMakingOrder);

    }
}