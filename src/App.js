import h from 'react-hyperscript'
import React from 'react'
import { Machine } from 'xstate'
import { style as createStyle } from 'typestyle'
import classNames from 'classnames'
import range from 'lodash/range'
import cloneDeep from 'lodash/cloneDeep'
import sum from 'lodash/sum'

// Example lifegame (23) using Statecharts

// -- logic (statechart)

const cellMachine = Machine({
  initial: 'dead',
  states: {
    alive: {
      on: {
        TICK: {
          dead: { cond: neighbors => neighbors !== 2 && neighbors !== 3 },
        },
      },
    },
    dead: {
      on: {
        TICK: {
          alive: { cond: neighbors => neighbors === 3 },
        },
      },
    },
  },
})

const gameMachine = Machine({
  initial: 'unrendered',
  states: {
    unrendered: {
      on: {
        Init: 'rendering',
      },
    },
    rendering: {
      onEntry: 'renderGrid',
      on: {
        '': 'rendered',
      },
    },
    rendered: {
      initial: 'paused',
      on: {
        RowsChanged: {
          rendering: { actions: ['changeRows'] },
        },
        ColsChanged: {
          rendering: { actions: ['changeCols'] },
        },
        SpeedChanged: {
          '.hist': { actions: ['changeSpeed'] },
        },
        RandomizeClicked: {
          '.hist': { actions: ['randomize'] },
        },
      },
      states: {
        paused: {
          on: {
            StartClicked: 'playing'
          },
        },
        playing: {
          on: {
            StopClicked: 'paused',
          },
          onEntry: 'clockStart',
          onExit: 'clockStop',
          initial: 'step',
          states: {
            step: {
              onEntry: 'doStep',
              on: {
                Tick: 'step',
              },
            },
          },
        },
        hist: {
          history: 'deep'
        },
      },
    },
  },
})

// -- presentation

const rows = 10
const cols = 10

const generateGame = (rows, cols) =>
  range(0, rows).map(
    r => range(0, cols).map(cell => 'dead')
  )

const normalizeValue = (max, value) => value >= max ? value - max : value < 0 ? max + value : value

const normalizeCoord = (coord, maxs) => coord.map((c, idx) => normalizeValue(maxs[idx], c))

const neighborsCoordsDeltas = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1]
]

const getNeighbors = (game, maxs, r, c) => neighborsCoordsDeltas
  .map(([dr, dc]) => normalizeCoord([r + dr, c + dc], maxs))
  .map(([nr, nc]) => game[nr][nc])

const toggleValue = value => value === 'alive' ? 'dead' : 'alive'

class App extends React.Component {

  state = {
    rows,
    cols,
    speed: 1,
    game: [],
    gameState: gameMachine.initial,
    timer: -1,
  }

  componentDidMount () {
    this.event('Init')
  }

  actions = {
    renderGrid: () => {
      return { game: generateGame(this.state.rows, this.state.cols) }
    },
    changeRows: rows => {
      return { rows }
    },
    changeCols: cols => {
      return { cols }
    },
    changeSpeed: speed => {
      return { speed }
    },
    randomize: () => {
      return {
        game: this.state.game.map(
          r => r.map(c => Math.random() < 0.3 ? 'alive' : 'dead')
        ),
      }
    },
    clockStart: () => {
      const timer = rInterval(() => {
        this.event('Tick')
      }, 200 / this.state.speed)
      return { timer }
    },
    clockStop: () => {
      this.state.timer.clear()
    },
    doStep: () => {
      const lastGame = cloneDeep(this.state.game)
      const rows = this.state.rows
      const cols = this.state.cols
      const game = this.state.game
      let numNeighbors
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          numNeighbors = sum(
            getNeighbors(lastGame, [this.state.rows, this.state.cols], i, j)
              .map(cell => cell === 'alive' ? 1 : 0)
          )
          game[i][j] = cellMachine.transition(game[i][j], 'TICK', numNeighbors).value
        }
      }
      return { game }
    },
  }

  async event (eventName, data) {
    console.log(this.state.gameState)
    console.log(eventName, data)
    const transitionData = gameMachine.transition(this.state.gameState, eventName)
    for (const actionName of transitionData.actions) {
      await new Promise(res => {
        const change = this.actions[actionName](data)
        if (change) {
          this.setState(change, res)
        } else {
          res()
        }
      })
    }
    this.setState({ gameState: transitionData })
  }

  toggleCell (rowIdx, colIdx) {
    this.setState(state => {
      state.game[rowIdx][colIdx] = toggleValue(state.game[rowIdx][colIdx])
      return state
    })
  }

  render() {
    return h('div', {
      className: style({ base: true }),
    }, [
      h('h1', { className: style({ title: true }) }, 'Conway\'s Game of Life'),
      h('div', { className: style({ menuBar: true }) }, [
        h('div', 'Rows:'),
        h('input', {
          className: style({ sizeInput: true }),
          type: 'number',
          min: 6,
          value: this.state.rows,
          onChange: ev => this.event('RowsChanged', parseInt(ev.target.value)),
        }),
        h('div', 'Cols:'),
        h('input', {
          className: style({ sizeInput: true }),
          type: 'number',
          min: 6,
          value: this.state.cols,
          onChange: ev => this.event('ColsChanged', parseInt(ev.target.value)),
        }),
      ]),
      h('div', { className: style({ menuBar: true }) }, [
        h('div', { className: style({ speed: true }) }, 'Speed:'),
        h('div', { className: style({ speed: true }) }, this.state.speed),
        h('input', {
          type: 'range',
          min: 0.1,
          max: 5,
          step: 0.1,
          value: this.state.speed,
          onChange: ev => this.event('SpeedChanged', ev.target.value),
        }),
      ]),
      h('div', { className: style('menuBar') },
        [
          ['Start', 'StartClicked'],
          ['Stop', 'StopClicked'],
          ['Randomize', 'RandomizeClicked'],
        ].map(
          ([buttonName, eventName]) => h('button', {
            className: style({ menuBtn: true }),
            onClick: () => this.event(eventName),
          }, buttonName)
        ),
      ),
      h('div', {
        className: style({ game: true }),
        style: {
          gridGap: '2px',
          gridTemplate: `repeat(${this.state.rows}, 1fr) / repeat(${this.state.cols}, 1fr)`,
        },
      },
        this.state.game.reduce(
          (a, col, rowIdx) => [
            ...a,
            ...col.map(
              (cell, colIdx) => h('div', {
                className: style({
                  cell: true,
                  [cell === 'alive' ? 'cellOn' : 'cellOff']: true,
                }),
                onClick: () => this.toggleCell(rowIdx, colIdx),
              })
            ),
          ],
          []
        )
      ),
    ])
  }
}

const palette = {
  primary: 'green',
  primaryLight: '#009200',
  secondary: '#A2A2A2',
  secondaryLight: '#C2C2C2',
  secondaryLighter: '#E5E5E5',
}

const clickable = {
  userSelect: 'none',
  cursor: 'pointer',
}

const styleObj = {
  base: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'sans-serif',
  },
  title: {
    fontSize: '25px',
    textAlign: 'center',
  },
  menuBar: {
    padding: '10px',
    display: 'flex',
    alignItems: 'center',
  },
  sizeInput: {
    width: '60px',
    margin: '4px',
    padding: '5px',
  },
  menuBtn: {
    margin: '0 5px',
    padding: '5px 10px',
    fontSize: '20px',
    borderRadius: '15px',
    border: '1px solid gray',
    background: 'none',
    outline: 'none',
    ...clickable,
    $nest: {
      '&:hover': {
        backgroundColor: palette.secondaryLighter,
      },
      '&:focus': {
        border: '1px dashed gray',
      },
    },
  },
  speed: {
    marginRight: '10px',
    minWidth: '30px',
  },
  game: {
    width: 'calc(100vw - 45px)',
    height: 'calc(100vw - 45px)',
    maxWidth: '600px',
    maxHeight: '600px',
    margin: '15px 5px 5px 5px',
    display: 'grid',
  },
  cell: {
    ...clickable,
    borderRadius: '3px',
  },
  cellOn: {
    backgroundColor: palette.primary,
    $nest: {
      '&:hover': {
        backgroundColor: palette.primaryLight,
      },
    },
  },
  cellOff: {
    backgroundColor: palette.secondary,
    $nest: {
      '&:hover': {
        backgroundColor: palette.secondaryLight,
      },
    },
  },
}

const style = styleGroup(styleObj)

function styleGroup(styleObj) {
  const classMap = {}
  for (const className in styleObj) {
    classMap[className] = createStyle(styleObj[className])
  }
  return styleCondObj => {
    const objWithClassNames = {}
    for (const name in styleCondObj) {
      objWithClassNames[classMap[name]] = styleCondObj[name]
    }
    return classNames(objWithClassNames)
  }
}

export default App

// interval using requestAnimationFrame
function rInterval (callback, delay) {
  var dateNow=Date.now,
    requestAnimation=window.requestAnimationFrame,
    start=dateNow(),
    stop,
    intervalFunc=function() {
      dateNow()-start<delay||(start+=delay, callback())
      stop||requestAnimation(intervalFunc)
    }
  requestAnimation(intervalFunc)
  return {
    clear: function(){ stop=1 }
  }
}
