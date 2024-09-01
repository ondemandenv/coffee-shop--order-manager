import {Context} from "aws-lambda";
import {unmarshall} from "@aws-sdk/util-dynamodb";


export async function handler(event: any, context: Context): Promise<boolean> {

    const order = event.body as { modifiers: string[], drink: string }
    console.log('sanitizeOrder: ', order)

    let valid = true
    const drinks = unmarshall(event.menu.Item) as {
        value: {
            "available": boolean,
            "drink": string,
            "icon": string,
            "modifiers": { Options: string[] }[]
        }[]
    }


    // Check drink.
    const result = drinks.value.filter((item) => item.drink === order.drink)


    if (result.length === 0) return false

    // Check modifiers
    console.log(JSON.stringify(result, null, 0))
    const modResult = order.modifiers.map((modifier) => {
        console.log(JSON.stringify(modifier, null, 0))

        const present = result[0].modifiers.filter((allowedModifiers) => allowedModifiers.Options.includes(modifier))
        if (present.length === 0) valid = false
    })
    console.log('sanitizeOrder: ', valid)
    // Order and modifiers both exist in the menu
    return valid


}