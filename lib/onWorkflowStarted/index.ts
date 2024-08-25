import {EventBridgeEvent} from "aws-lambda/trigger/eventbridge";
import {Context} from "aws-lambda";
import {DynamoDBDocument} from "@aws-sdk/lib-dynamodb"
import {DynamoDB} from "@aws-sdk/client-dynamodb"
import {SFN} from "@aws-sdk/client-sfn"
import {UpdateCommandInput} from "@aws-sdk/lib-dynamodb/dist-types/commands/UpdateCommand";


export async function handler(event: EventBridgeEvent<any, any>, context: Context): Promise<void> {

    console.log(`>>>event
    ${JSON.stringify(event, null, 4)}
----event----env----
    ${JSON.stringify(process.env, null, 4)}
----env----context----
    ${JSON.stringify(context, null, 4)}
<<<context`)

    const documentClient = DynamoDBDocument.from(new DynamoDB())
    const stepFunctions = new SFN()

    const params = {
        TableName: process.env.orderTableName,
        Key: {
            PK: 'orders',
            SK: event.detail.orderId,
        },
        UpdateExpression: "set drinkOrder = :drinkOrder, TS = :TS",
        ConditionExpression: "#userId = :userId",
        ExpressionAttributeNames: {
            "#userId": "USERID"
        },
        ExpressionAttributeValues: {
            ":drinkOrder": event.detail.drink,
            ":userId": event.detail.userId,
            ":TS": Date.now()
        },
        ReturnValues: "ALL_NEW"
    } as UpdateCommandInput

    console.log(params)
    const result = await documentClient.update(params)
    console.log(result)

    // Update Step Functions workflow
    const sfnParams = {
        taskToken: result.Attributes!.TaskToken,
        output: JSON.stringify({'orderId': event.detail.orderId})
    }
    console.log({sfnParams})
    const sfnResult = await stepFunctions.sendTaskSuccess(sfnParams)
    console.log({sfnResult})


}